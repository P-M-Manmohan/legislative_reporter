"""
Legislative Reporter API v0.4.0
YouTube transcript ingestion through SerpApi plus TXT/SRT/VTT/PDF uploads.
Local Whisper transcription has been removed.
"""
import json
import logging
import os
import re
import sqlite3
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any

import requests
from fastapi import FastAPI, File, HTTPException, Query, UploadFile
from fastapi.concurrency import run_in_threadpool
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    print("did not find env")

APP_VERSION = "0.4.0"
BASE_DIR = Path(__file__).resolve().parent
UPLOAD_DIR = BASE_DIR / "uploads"
DATA_DIR = BASE_DIR / "data"
JOBS_DIR = DATA_DIR / "jobs"
MAX_UPLOAD_BYTES = 500 * 1024 * 1024
CHUNK_SIZE = 800
SERPAPI_ENDPOINT = "https://serpapi.com/search.json"
SUPPORTED_EXTENSIONS = {".txt", ".srt", ".vtt", ".pdf"}

for directory in (UPLOAD_DIR, DATA_DIR, JOBS_DIR):
    directory.mkdir(parents=True, exist_ok=True)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO").upper(),
                    format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("legislative_reporter")
app = FastAPI(title="Legislative Reporter API",
              description="Timestamped YouTube transcript and document ingestion.",
              version=APP_VERSION)
app.add_middleware(
    CORSMiddleware,
    allow_origins=[origin.strip() for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:5173,http://127.0.0.1:5173,http://localhost,https://localhost,capacitor://localhost",
    ).split(",") if origin.strip()],
    allow_origin_regex=r"^http://(localhost|127\.0\.0\.1):(4173|517[0-9])$",
    allow_methods=["GET", "POST", "OPTIONS"],
    allow_headers=["Content-Type", "Authorization"],
)



app = FastAPI(title="Legislative Reporter API")

# Adjust only if your existing SQLite database is in another location.
DB_PATH = Path(__file__).resolve().parent / "data" / "legislative.db"


def get_db():
    if not DB_PATH.is_file():
        raise HTTPException(
            status_code=500,
            detail=f"Database not found: {DB_PATH}",
        )

    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


# --------------------------------- Retrieval ---------------------------------

def connect_legislative_database() -> sqlite3.Connection:
    """Open the channel-ingestion database and migrate the summary column."""
    database_path = DATA_DIR / "legislative.db"
    if not database_path.is_file():
        raise HTTPException(status_code=503, detail="Assembly transcript database is not available.")
    connection = sqlite3.connect(database_path, timeout=30)
    connection.row_factory = sqlite3.Row
    try:
        columns = {row["name"] for row in connection.execute("PRAGMA table_info(videos)")}
        if not columns:
            raise HTTPException(status_code=503, detail="The videos table is not initialized.")
        if "summary" not in columns:
            connection.execute("ALTER TABLE videos ADD COLUMN summary TEXT")
            connection.commit()
        return connection
    except Exception:
        connection.close()
        raise


def generate_video_summary(title: str, transcript: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Summarize a complete transcript in chunks while retaining segment IDs."""
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise HTTPException(status_code=503, detail="Summaries need OPENAI_API_KEY configured.")
    try:
        from openai import OpenAI

        client = OpenAI(api_key=api_key)
        model = os.getenv("SUMMARY_MODEL", os.getenv("TRANSLATION_MODEL", "gpt-4o-mini"))
        chunk_size = 80
        notes: list[dict[str, Any]] = []
        for offset in range(0, len(transcript), chunk_size):
            chunk = transcript[offset:offset + chunk_size]
            payload = [{
                "segment_id": row["id"],
                "timestamp_seconds": row["start_seconds"],
                "text": row["text_english"] or row["text"],
            } for row in chunk]
            response = client.chat.completions.create(
                model=model,
                temperature=0,
                response_format={"type": "json_object"},
                messages=[
                    {"role": "system", "content": (
                        "Summarize this transcript excerpt from a legislative proceeding. "
                        "Use only facts explicitly stated in the transcript. Return a few "
                        "concise factual sentences; each sentence must list segment_ids "
                        "that directly support it. Do not infer decisions, bills, speakers, "
                        "or outcomes. Omit unclear material. Return JSON as "
                        "{\"sentences\":[{\"text\":\"...\",\"segment_ids\":[1,2]}]}."
                    )},
                    {"role": "user", "content": json.dumps({"title": title, "segments": payload}, ensure_ascii=False)},
                ],
            )
            result = json.loads(response.choices[0].message.content or "{}")
            allowed_ids = {row["id"] for row in chunk}
            for item in result.get("sentences", []):
                if not isinstance(item, dict) or not isinstance(item.get("text"), str):
                    continue
                ids = item.get("segment_ids")
                if not isinstance(ids, list):
                    continue
                ids = list(dict.fromkeys(x for x in ids if isinstance(x, int) and x in allowed_ids))
                if item["text"].strip() and ids:
                    notes.append({"text": item["text"].strip(), "segment_ids": ids})

        if not notes:
            raise RuntimeError("No source-linked summary sentences were returned.")

        # Keep the summary short while preserving citations from source-linked notes.
        all_ids = {segment_id for note in notes for segment_id in note["segment_ids"]}
        response = client.chat.completions.create(
            model=model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": (
                    "Write a concise overview using only the supplied source-linked notes. "
                    "Do not add facts. Every sentence must retain IDs of notes that support "
                    "it, and may only cite supplied segment IDs. Return JSON as "
                    "{\"sentences\":[{\"text\":\"...\",\"segment_ids\":[1,2]}]}."
                )},
                {"role": "user", "content": json.dumps({"title": title, "notes": notes}, ensure_ascii=False)},
            ],
        )
        result = json.loads(response.choices[0].message.content or "{}")
        sentences = []
        for item in result.get("sentences", []):
            if not isinstance(item, dict) or not isinstance(item.get("text"), str):
                continue
            ids = item.get("segment_ids")
            if not isinstance(ids, list):
                continue
            ids = list(dict.fromkeys(x for x in ids if isinstance(x, int) and x in all_ids))
            if item["text"].strip() and ids:
                sentences.append({"text": item["text"].strip(), "segment_ids": ids})
        if not sentences:
            raise RuntimeError("Summary omitted valid transcript citations.")
        return sentences
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Transcript summary generation failed")
        raise HTTPException(status_code=502, detail="Could not summarize this transcript. Please try again later.") from exc


@app.get("/api/videos")
async def list_transcript_videos(limit: int = Query(default=10, ge=1, le=500)):
    """List videos that have transcript segments available for summarizing."""
    connection = connect_legislative_database()
    try:
        rows = connection.execute("""
            SELECT v.video_id, v.title, v.published_at, v.url, v.summary,
                   COUNT(s.id) AS segment_count
            FROM videos v
            JOIN transcript_segments s ON s.video_id = v.video_id
            GROUP BY v.video_id
            ORDER BY v.published_at DESC, v.title
            LIMIT ?
        """, (limit,)).fetchall()
        return [{
            "video_id": row["video_id"], "title": row["title"],
            "published_at": row["published_at"], "url": row["url"],
            "segment_count": row["segment_count"],
            "has_summary": bool(row["summary"]),
            "summary": _decode_summary(row["summary"]),
        } for row in rows]
    except sqlite3.OperationalError as exc:
        logger.exception("Could not list transcript videos")
        raise HTTPException(status_code=503, detail="Transcript database schema is not ready.") from exc
    finally:
        connection.close()


def _decode_summary(value: str | None) -> dict[str, Any] | None:
    if not value:
        return None
    try:
        return json.loads(value)
    except json.JSONDecodeError:
        return None


def generate_and_store_video_summary(video_id: str) -> dict[str, Any]:
    """Generate and persist the source-cited summary for a transcript video."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("Invalid YouTube video ID.")
    connection = connect_legislative_database()
    try:
        video = connection.execute(
            "SELECT video_id, title, url, summary FROM videos WHERE video_id = ?", (video_id,)
        ).fetchone()
        if not video:
            raise LookupError("Video not found.")
        if video["summary"]:
            stored = _decode_summary(video["summary"])
            if stored:
                return stored
            else:
                logger.warning("Ignoring malformed stored summary for video %s", video_id)
        transcript = [dict(row) for row in connection.execute("""
            SELECT id, start_seconds, end_seconds, text, text_english
            FROM transcript_segments
            WHERE video_id = ?
            ORDER BY start_seconds, id
        """, (video_id,)).fetchall()]
        if not transcript:
            raise LookupError("No transcript segments are available for this video.")
        title, url = video["title"], video["url"]
    finally:
        connection.close()

    sentences = generate_video_summary(title, transcript)
    segment_by_id = {row["id"]: row for row in transcript}
    for sentence in sentences:
        sentence["citations"] = [{
            "segment_id": segment_id,
            "start_seconds": segment_by_id[segment_id]["start_seconds"],
            "end_seconds": segment_by_id[segment_id]["end_seconds"],
        } for segment_id in sentence.pop("segment_ids")]
    summary = {
        "video_id": video_id,
        "title": title,
        "url": url,
        "generated_at": now_iso(),
        "sentences": sentences,
    }
    connection = connect_legislative_database()
    try:
        connection.execute("UPDATE videos SET summary = ? WHERE video_id = ?", (
            json.dumps(summary, ensure_ascii=False), video_id,
        ))
        connection.commit()
        return summary
    except sqlite3.OperationalError as exc:
        logger.exception("Could not summarize video %s", video_id)
        raise RuntimeError("Transcript database schema is not ready.") from exc
    finally:
        connection.close()


@app.post("/api/videos/{video_id}/summary")
async def summarize_video(video_id: str):
    """Return or generate a source-cited summary, persisted on videos.summary."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID.")
    try:
        return await run_in_threadpool(generate_and_store_video_summary, video_id)
    except LookupError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except HTTPException:
        raise
    except Exception as exc:
        logger.exception("Could not summarize video %s", video_id)
        raise HTTPException(status_code=502, detail="Could not summarize this transcript. Please try again later.") from exc

@app.get("/api/jobs/{job_id}")
async def get_job(job_id: str):
    return load_job(job_id)


@app.get("/api/jobs/{job_id}/segments/{segment_id}")
async def get_segment(job_id: str, segment_id: str):
    job = load_job(job_id)
    # Accept the route parameter's intended name via the path alias below.
    for item in job.get("segments", []):
        if item.get("segment_id") == segment_id:
            return {"job_id": job_id, "source_url": job.get("source_url"), "segment": item}
    raise HTTPException(status_code=404, detail="Segment not found.")


@app.get("/health")
async def health():
    return {
        row["name"]
        for row in conn.execute(f"PRAGMA table_info({table})").fetchall()
    }


def get_video_or_404(conn: sqlite3.Connection, video_id: str):
    video = conn.execute(
        "SELECT * FROM videos WHERE video_id = ?",
        (video_id,),
    ).fetchone()

    if video is None:
        raise HTTPException(status_code=404, detail="Video not found.")

    return dict(video)


def get_video_segments(conn: sqlite3.Connection, video_id: str):
    columns = get_table_columns(conn, "transcript_segments")

    english_column = (
        "text_english" if "text_english" in columns else None
    )

    select_english = (
        f", {english_column} AS text_english"
        if english_column
        else ", NULL AS text_english"
    )

    rows = conn.execute(
        f"""
        SELECT id, start_seconds, end_seconds, text
               {select_english}
        FROM transcript_segments
        WHERE video_id = ?
        ORDER BY start_seconds, id
        """,
        (video_id,),
    ).fetchall()

    return [dict(row) for row in rows]

@app.get("/api/ml/videos")
def list_malayalam_videos():
    with get_db() as conn:
        rows = conn.execute(
            """
            SELECT video_id AS id, title
            FROM videos
            ORDER BY published_at DESC
            """
        ).fetchall()

        return [dict(row) for row in rows]


@app.get("/api/eng/videos")
def list_english_videos():
    with get_db() as conn:
        columns = get_table_columns(conn, "videos")

        title_column = (
            "title_english" if "title_english" in columns else "title"
        )

        rows = conn.execute(
            f"""
            SELECT video_id AS id, {title_column} AS title
            FROM videos
            ORDER BY published_at DESC
            """
        ).fetchall()

        return [dict(row) for row in rows]

@app.get("/api/ml/video/{video_id}")
def get_malayalam_video(video_id: str):
    with get_db() as conn:
        video = get_video_or_404(conn, video_id)
        segments = get_video_segments(conn, video_id)

        return {
            "id": video["video_id"],
            "title": video["title"],
            "summary": video.get("summary"),
            "segments": [
                {
                    "start_seconds": s["start_seconds"],
                    "end_seconds": s["end_seconds"],
                    "text": s["text"],
                }
                for s in segments
            ],
        }


@app.get("/api/eng/video/{video_id}")
def get_english_video(video_id: str):
    with get_db() as conn:
        video = get_video_or_404(conn, video_id)
        columns = get_table_columns(conn, "videos")

        title = (
            video.get("title_english")
            if "title_english" in columns
            else video["title"]
        )

        segments = get_video_segments(conn, video_id)

        return {
            "id": video["video_id"],
            "title": title,
            "summary": video.get("summary_english"),
            "segments": [
                {
                    "start_seconds": s["start_seconds"],
                    "end_seconds": s["end_seconds"],
                    "text": s["text_english"],
                }
                for s in segments
            ],
        }
