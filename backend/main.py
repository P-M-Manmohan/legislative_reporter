import sqlite3
from pathlib import Path
from typing import Any

from fastapi import HTTPException, Query, FastAPI



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


def get_table_columns(conn: sqlite3.Connection, table: str) -> set[str]:
    # Table names here are internal constants, not user input.
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
