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
import threading
import time
from datetime import datetime, timezone
from html.parser import HTMLParser
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

ASSEMBLY_MEMBERS_URL = "https://www.niyamasabha.org/codes/members.htm"
_members_cache: dict[str, Any] = {"expires_at": 0.0, "members": None}
_members_cache_lock = threading.Lock()


class _AssemblyMembersParser(HTMLParser):
    """Extract constituency rows and official portrait paths from the Assembly directory."""

    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.in_row = False
        self.in_cell = False
        self.cell_text: list[str] = []
        self.cell_images: list[str] = []
        self.cells: list[tuple[str, list[str]]] = []
        self.rows: list[dict[str, str | None]] = []

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag == "tr":
            self.in_row, self.cells = True, []
        elif self.in_row and tag in {"td", "th"}:
            self.in_cell, self.cell_text, self.cell_images = True, [], []
        elif self.in_cell and tag == "img" and attrs.get("src"):
            self.cell_images.append(attrs["src"])

    def handle_data(self, data):
        if self.in_cell:
            self.cell_text.append(data)

    def handle_endtag(self, tag):
        if self.in_cell and tag in {"td", "th"}:
            self.cells.append((" ".join(" ".join(self.cell_text).split()), self.cell_images))
            self.in_cell = False
        elif self.in_row and tag == "tr":
            if len(self.cells) >= 2:
                name, constituency = self.cells[0][0], self.cells[1][0]
                match = re.search(r"\(\s*(\d{1,3})\s*\)\s*$", constituency)
                if match and name and name.lower() != "name":
                    images = [src for _, srcs in self.cells for src in srcs]
                    portrait = next((src for src in reversed(images) if "members-16kla" in src.lower()), None)
                    if portrait:
                        portrait = requests.compat.urljoin(ASSEMBLY_MEMBERS_URL, portrait)
                    self.rows.append({"name": name, "constituency": constituency[:match.start()].strip(),
                                      "constituency_number": match.group(1), "image_url": portrait})
            self.in_row = False
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
    """Open the channel-ingestion database and migrate summary columns."""
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
        if "summary_english" not in columns:
            connection.execute("ALTER TABLE videos ADD COLUMN summary_english TEXT")
        if "title_english" not in columns:
            connection.execute("ALTER TABLE videos ADD COLUMN title_english TEXT")
        connection.execute("""
            UPDATE videos SET summary_english = summary
            WHERE summary_english IS NULL AND summary IS NOT NULL
        """)
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


def load_official_assembly_members() -> list[dict[str, str | None]]:
    """Fetch and cache the current member directory and its published portraits."""
    with _members_cache_lock:
        if _members_cache["members"] and _members_cache["expires_at"] > time.monotonic():
            return _members_cache["members"]
    response = requests.get(
        ASSEMBLY_MEMBERS_URL,
        headers={"User-Agent": "NiyamasabhaAI/1.0 (official member directory display)"},
        timeout=15,
    )
    response.raise_for_status()
    parser = _AssemblyMembersParser()
    parser.feed(response.text)
    if len(parser.rows) < 100:
        raise RuntimeError("The official Assembly member directory could not be parsed.")
    members = parser.rows
    with _members_cache_lock:
        _members_cache.update(members=members, expires_at=time.monotonic() + 3600)
    return members


@app.get("/api/members")
async def list_assembly_members():
    """Return current Assembly members and portrait URLs from the official directory."""
    try:
        members = await run_in_threadpool(load_official_assembly_members)
        return {"count": len(members), "source_url": ASSEMBLY_MEMBERS_URL, "members": members}
    except Exception as exc:
        logger.exception("Could not fetch the official Assembly member directory")
        raise HTTPException(status_code=502, detail="Could not load the official Assembly member directory.") from exc


@app.get("/api/videos")
async def list_transcript_videos(limit: int = Query(default=10, ge=1, le=500)):
    """List videos that have transcript segments available for summarizing."""
    connection = connect_legislative_database()
    try:
        rows = connection.execute("""
            SELECT v.video_id, v.title, v.title_english, v.published_at, v.url, v.summary,
                   v.summary_english,
                   COUNT(s.id) AS segment_count
            FROM videos v
            JOIN transcript_segments s ON s.video_id = v.video_id
            GROUP BY v.video_id
            ORDER BY v.published_at DESC, v.title
            LIMIT ?
        """, (limit,)).fetchall()
        result = []
        for row in rows:
            summary_ml = _summary_for_language(row["summary"], "ml")
            summary_en = _summary_for_language(row["summary_english"], "en") or _summary_for_language(row["summary"], "en")
            result.append({
            "video_id": row["video_id"], "title": row["title"], "title_english": row["title_english"],
            "published_at": row["published_at"], "url": row["url"],
            "segment_count": row["segment_count"],
            "has_summary": bool(summary_ml or summary_en),
            "summary": summary_ml,
            "summary_english": summary_en,
            })
        return result
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


def _contains_malayalam(value: str) -> bool:
    return bool(re.search(r"[\u0d00-\u0d7f]", value or ""))


def _summary_for_language(value: str | None, language: str) -> dict[str, Any] | None:
    summary = _decode_summary(value)
    if not summary:
        return None
    text = " ".join(item.get("text", "") for item in summary.get("sentences", []))
    contains_malayalam = _contains_malayalam(text)
    return summary if (contains_malayalam if language == "ml" else not contains_malayalam) else None


def translate_summary_to_malayalam(english_summary: dict[str, Any]) -> dict[str, Any]:
    """Translate summary text while preserving sentence order and citations."""
    if not os.getenv("OPENAI_API_KEY"):
        raise HTTPException(status_code=503, detail="Malayalam summaries need OPENAI_API_KEY configured.")
    try:
        from openai import OpenAI

        client = OpenAI(api_key=os.getenv("OPENAI_API_KEY"))
        model = os.getenv("SUMMARY_MODEL", os.getenv("TRANSLATION_MODEL", "gpt-4o-mini"))
        sentences = english_summary.get("sentences", [])
        response = client.chat.completions.create(
            model=model,
            temperature=0,
            response_format={"type": "json_object"},
            messages=[
                {"role": "system", "content": (
                    "Translate the following legislative summary faithfully into Malayalam. Translate "
                    "its original video title into concise natural English as title_english (if already "
                    "English, keep it unchanged). "
                    "Return JSON with a translations array containing exactly one Malayalam "
                    "text for each input sentence, preserving order. Do not add or remove facts."
                )},
                {"role": "user", "content": json.dumps({
                    "title": english_summary.get("title", ""),
                    "sentences": [item.get("text", "") for item in sentences],
                }, ensure_ascii=False)},
            ],
        )
        result = json.loads(response.choices[0].message.content or "{}")
        translations = result.get("translations")
        if not isinstance(translations, list) or len(translations) != len(sentences):
            raise RuntimeError("Translation response did not preserve sentence count.")
        title_english = result.get("title_english")
        if not isinstance(title_english, str) or not title_english.strip():
            raise RuntimeError("Translation response omitted the English video title.")
        translated = []
        for item, value in zip(sentences, translations):
            text = value.get("text") if isinstance(value, dict) else value
            if not isinstance(text, str) or not text.strip():
                raise RuntimeError("Translation response contains an empty sentence.")
            translated.append({**item, "text": text.strip()})
        return {**english_summary, "title_english": title_english.strip(), "sentences": translated}
    except Exception as exc:
        logger.exception("Malayalam summary translation failed")
        raise RuntimeError("Could not translate the video summary to Malayalam.") from exc


def generate_and_store_video_summary(video_id: str, language: str = "en") -> dict[str, Any]:
    """Generate both summary languages, persist them, and return the selected language."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("Invalid YouTube video ID.")
    connection = connect_legislative_database()
    try:
        video = connection.execute(
            "SELECT video_id, title, title_english, url, summary, summary_english FROM videos WHERE video_id = ?", (video_id,)
        ).fetchone()
        if not video:
            raise LookupError("Video not found.")
        english_summary = _decode_summary(video["summary_english"])
        existing_summary = _decode_summary(video["summary"])
        if not english_summary and existing_summary and not _contains_malayalam(
            " ".join(item.get("text", "") for item in existing_summary.get("sentences", []))
        ):
            english_summary = existing_summary
        malayalam_text = " ".join(item.get("text", "") for item in (existing_summary or {}).get("sentences", []))
        malayalam_summary = existing_summary if existing_summary and _contains_malayalam(malayalam_text) else None
        if english_summary and video["title_english"] and (language == "en" or malayalam_summary):
            return ({**english_summary, "title_english": video["title_english"]}
                    if language == "en" else malayalam_summary)
        transcript = []
        if not english_summary:
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

    if not english_summary:
        sentences = generate_video_summary(title, transcript)
        segment_by_id = {row["id"]: row for row in transcript}
        for sentence in sentences:
            sentence["citations"] = [{
                "segment_id": segment_id,
                "start_seconds": segment_by_id[segment_id]["start_seconds"],
                "end_seconds": segment_by_id[segment_id]["end_seconds"],
            } for segment_id in sentence.pop("segment_ids")]
        english_summary = {
            "video_id": video_id, "title": title, "url": url,
            "generated_at": now_iso(), "sentences": sentences,
        }
    if not existing_summary or not _contains_malayalam(
        " ".join(item.get("text", "") for item in existing_summary.get("sentences", []))
    ):
        connection = connect_legislative_database()
        try:
            connection.execute("UPDATE videos SET summary_english = ? WHERE video_id = ?", (
                json.dumps(english_summary, ensure_ascii=False), video_id,
            ))
            connection.commit()
        finally:
            connection.close()
    if not malayalam_summary or not video["title_english"]:
        translated_malayalam_summary = translate_summary_to_malayalam(english_summary)
        if malayalam_summary:
            malayalam_summary = {
                **malayalam_summary,
                "title_english": translated_malayalam_summary.get("title_english"),
            }
        else:
            malayalam_summary = translated_malayalam_summary
    connection = connect_legislative_database()
    try:
        serialized_summary = json.dumps(malayalam_summary, ensure_ascii=False)
        serialized_english = json.dumps(english_summary, ensure_ascii=False)
        connection.execute("UPDATE videos SET summary = ?, summary_english = ?, title_english = COALESCE(?, title_english) WHERE video_id = ?", (
            serialized_summary, serialized_english, malayalam_summary.get("title_english"), video_id,
        ))
        connection.commit()
        return ({**english_summary, "title_english": malayalam_summary.get("title_english")}
                if language == "en" else malayalam_summary)
    except sqlite3.OperationalError as exc:
        logger.exception("Could not summarize video %s", video_id)
        raise RuntimeError("Transcript database schema is not ready.") from exc
    finally:
        connection.close()


@app.post("/api/videos/{video_id}/summary")
async def summarize_video(video_id: str, language: str = Query(default="en", regex="^(en|ml)$")):
    """Return or generate a source-cited summary, persisted on videos.summary."""
    if not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise HTTPException(status_code=400, detail="Invalid YouTube video ID.")
    try:
        return await run_in_threadpool(generate_and_store_video_summary, video_id, language)
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
