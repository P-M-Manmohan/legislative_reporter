
import os
import re
import time
import logging
from datetime import datetime, timezone
from pathlib import Path

import requests
import yt_dlp
from dotenv import load_dotenv

from database import get_connection, init_db, migrate_db
from translator import translate_segments

load_dotenv()

SERPAPI_KEY = os.getenv("SERPAPI_KEY") or os.getenv("SERPAPI_API_KEY")
CHANNEL_URL = os.getenv("YOUTUBE_CHANNEL_URL")
LANGUAGE_CODE = os.getenv("TRANSCRIPT_LANGUAGE", "ml")
MAX_VIDEOS = int(os.getenv("MAX_VIDEOS", "100"))

SERPAPI_ENDPOINT = "https://serpapi.com/search.json"

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
)

logger = logging.getLogger(__name__)


def extract_video_id(video):
    """Get a YouTube video ID from yt-dlp metadata."""
    video_id = video.get("id")

    if video_id:
        return str(video_id)

    url = video.get("url") or video.get("webpage_url") or ""
    match = re.search(r"(?:v=|youtu\.be/)([A-Za-z0-9_-]{11})", url)

    return match.group(1) if match else None


def discover_videos():
    """Return up to MAX_VIDEOS recent channel video entries."""
    if not CHANNEL_URL:
        raise RuntimeError(
            "Set YOUTUBE_CHANNEL_URL in your .env file."
            )

    options = {
        "extract_flat": "in_playlist",
        "playlistend": MAX_VIDEOS,
        "skip_download": True,
        "quiet": True,
        "no_warnings": True,
        "ignoreerrors": True,
    }

    logger.info("Discovering videos from %s", CHANNEL_URL)

    with yt_dlp.YoutubeDL(options) as ydl:
        result = ydl.extract_info(CHANNEL_URL, download=False)

    if not result:
        raise RuntimeError(
            "Could not read the channel. Check its URL and accessibility."
        )

    entries = result.get("entries") or []
    videos = []

    for item in entries:
        if not item:
            continue

        video_id = extract_video_id(item)
        if not video_id:
            logger.warning("Skipping entry without a video ID: %s",
                           item.get("title", "Unknown title"))
            continue

        videos.append({
            "video_id": video_id,
            "title": item.get("title") or video_id,
            "url": f"https://www.youtube.com/watch?v={video_id}",
            "published_at": item.get("upload_date"),
            "duration_seconds": item.get("duration"),
        })

    # Preserve channel order while removing duplicate IDs.
    unique_videos = []
    seen = set()

    for video in videos:
        if video["video_id"] not in seen:
            seen.add(video["video_id"])
            unique_videos.append(video)

    logger.info("Discovered %d videos", len(unique_videos))
    return unique_videos[:MAX_VIDEOS]


def save_video(video):
    """Insert or refresh video metadata without resetting status."""
    with get_connection() as conn:
        conn.execute("""
            INSERT INTO videos (
                video_id, title, url, published_at, duration_seconds
            )
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(video_id) DO UPDATE SET
                title = excluded.title,
                url = excluded.url,
                published_at = COALESCE(
                    excluded.published_at, videos.published_at
                ),
                duration_seconds = COALESCE(
                    excluded.duration_seconds, videos.duration_seconds
                ),
                updated_at = CURRENT_TIMESTAMP
        """, (
            video["video_id"],
            video["title"],
            video["url"],
            video["published_at"],
            video["duration_seconds"],
        ))


def fetch_transcript(video_id):
    """Fetch timestamped transcript segments from SerpApi."""
    if not SERPAPI_KEY:
        raise RuntimeError(
            "SERPAPI_KEY is missing from your .env file."
        )

    params = {
        "engine": "youtube_video_transcript",
        "v": video_id,
        "language_code": LANGUAGE_CODE,
        "api_key": SERPAPI_KEY,
    }

    response = requests.get(
        SERPAPI_ENDPOINT,
        params=params,
        timeout=60,
    )
    response.raise_for_status()
    data = response.json()

    if data.get("error"):
        raise RuntimeError(str(data["error"]))

    raw_segments = data.get("transcript")

    if not isinstance(raw_segments, list) or not raw_segments:
        available = data.get("available_transcripts", [])
        raise RuntimeError(
            "No transcript returned. Available transcripts: "
            f"{available}"
        )

    segments = []

    for item in raw_segments:
        if not isinstance(item, dict):
            continue

        text = item.get("snippet")
        start_ms = item.get("start_ms")
        end_ms = item.get("end_ms")

        if not isinstance(text, str) or not text.strip():
            continue

        try:
            start_seconds = float(start_ms) / 1000.0
            end_seconds = (
                float(end_ms) / 1000.0
                if end_ms is not None
                else None
            )
        except (TypeError, ValueError):
            continue

        segments.append({
            "start_seconds": start_seconds,
            "end_seconds": end_seconds,
            "text": text.strip(),
        })

    if not segments:
        raise RuntimeError(
            "Transcript was returned, but no usable timestamped "
            "segments were found. Check the SerpApi response schema."
        )

        # Estimate missing end times from the next segment's start.
    segments.sort(key=lambda segment: segment["start_seconds"])

    for index, segment in enumerate(segments):
        if segment["end_seconds"] is not None:
            continue

        if index + 1 < len(segments):
            next_start = segments[index + 1]["start_seconds"]

            if next_start > segment["start_seconds"]:
                segment["end_seconds"] = next_start


    return segments


def save_transcript(video_id, segments):
    with get_connection() as conn:
        conn.execute(
            "DELETE FROM transcript_segments WHERE video_id = ?",
            (video_id,),
        )

        conn.executemany("""
            INSERT INTO transcript_segments (
                video_id,
                start_seconds,
                end_seconds,
                text,
                text_english
            )
            VALUES (?, ?, ?, ?, ?)
        """, [
            (
                video_id,
                segment["start_seconds"],
                segment["end_seconds"],
                segment["text"],
                segment["text_english"],
            )
            for segment in segments
        ])

        conn.execute("""
            UPDATE videos
            SET summary = NULL,
                transcript_status = 'completed',
                transcript_error = NULL,
                updated_at = CURRENT_TIMESTAMP
            WHERE video_id = ?
        """, (video_id,))


def mark_failed(video_id, error):
    """Record the failure so the video can be retried later."""
    with get_connection() as conn:
        conn.execute("""
            UPDATE videos
            SET transcript_status = 'failed',
                transcript_error = ?,
                updated_at = CURRENT_TIMESTAMP
            WHERE video_id = ?
        """, (str(error)[:4000], video_id))


def is_completed(video_id):
    with get_connection() as conn:
        row = conn.execute("""
            SELECT transcript_status
            FROM videos
            WHERE video_id = ?
        """, (video_id,)).fetchone()

    return row and row["transcript_status"] == "completed"


def generate_summary_if_missing(video_id, title):
    """Create the persisted summary after transcript storage; keep ingestion resilient."""
    try:
        # Lazy import avoids loading the API module during ordinary helper imports.
        from main import generate_and_store_video_summary

        generate_and_store_video_summary(video_id)
        logger.info("Saved transcript summary for %s", video_id)
    except Exception:
        logger.exception("Transcript saved, but summary generation failed for %s (%s)", video_id, title)


def main():
    if not SERPAPI_KEY:
        raise RuntimeError(
            "Missing SERPAPI_KEY. Configure it in .env."
        )

    init_db()
    migrate_db()
    videos = discover_videos()

    if not videos:
        logger.warning("No videos found.")
        return

    for index, video in enumerate(videos, start=1):
        video_id = video["video_id"]

        save_video(video)

        if is_completed(video_id):
            logger.info(
                "[%d/%d] Already completed: %s",
                index, len(videos), video["title"],
            )
            generate_summary_if_missing(video_id, video["title"])
            continue

        logger.info(
            "[%d/%d] Fetching transcript: %s",
            index, len(videos), video["title"],
        )

       
        try:
            # Fetch the original Malayalam transcript.
            segments = fetch_transcript(video_id)

            logger.info(
                "Fetched %d Malayalam segments for %s",
                len(segments),
                video_id,
            )

            # Translate segments with neighboring context.
            translated_segments = translate_segments(segments)

            # Save original and English text together.
            save_transcript(video_id, translated_segments)

            logger.info(
                "Saved %d bilingual segments for %s",
                len(translated_segments),
                video_id,
            )

            generate_summary_if_missing(video_id, video["title"])

        except Exception as exc:
            logger.exception(
                "Processing failed for %s",
                video_id,
            )
            mark_failed(video_id, exc)

        # Avoid sending requests back-to-back.
        time.sleep(1)

    with get_connection() as conn:
        total = conn.execute(
            "SELECT COUNT(*) FROM videos"
        ).fetchone()[0]

        completed = conn.execute("""
            SELECT COUNT(*) FROM videos
            WHERE transcript_status = 'completed'
        """).fetchone()[0]

        failed = conn.execute("""
            SELECT COUNT(*) FROM videos
            WHERE transcript_status = 'failed'
        """).fetchone()[0]

        segment_count = conn.execute(
            "SELECT COUNT(*) FROM transcript_segments"
        ).fetchone()[0]

    logger.info("Ingestion finished.")
    logger.info("Videos in database: %d", total)
    logger.info("Completed transcripts: %d", completed)
    logger.info("Failed transcripts: %d", failed)
    logger.info("Total transcript segments: %d", segment_count)


if __name__ == "__main__":
    main()

