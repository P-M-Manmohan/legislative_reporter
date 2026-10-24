
import sqlite3
from pathlib import Path

DB_PATH = Path("data/legislative.db")


def get_connection():
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)

    conn = sqlite3.connect(DB_PATH, timeout=30)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn

def migrate_db():
    with get_connection() as conn:
        columns = {
            row["name"]
            for row in conn.execute("PRAGMA table_info(videos)")
        }

        migrations = {
            "summary": "ALTER TABLE videos ADD COLUMN summary TEXT",
            "transcript_status": (
                "ALTER TABLE videos ADD COLUMN "
                "transcript_status TEXT NOT NULL DEFAULT 'pending'"
            ),
            "transcript_error": (
                "ALTER TABLE videos ADD COLUMN transcript_error TEXT"
            ),
            "discovered_at": (
                "ALTER TABLE videos ADD COLUMN discovered_at TEXT"
            ),
            "updated_at": (
                "ALTER TABLE videos ADD COLUMN updated_at TEXT"
            ),
        }

        for column, sql in migrations.items():
            if column not in columns:
                conn.execute(sql)
                print(f"Added column: {column}")

def init_db():
    with get_connection() as conn:
        conn.executescript("""
            CREATE TABLE IF NOT EXISTS videos (
                video_id TEXT PRIMARY KEY,
                title TEXT NOT NULL,
                url TEXT NOT NULL,
                published_at TEXT,
                duration_seconds INTEGER,
                summary TEXT,
                transcript_status TEXT NOT NULL DEFAULT 'pending',
                transcript_error TEXT,
                discovered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
                updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
            );

            CREATE TABLE IF NOT EXISTS transcript_segments (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                video_id TEXT NOT NULL,
                start_seconds REAL NOT NULL,
                end_seconds REAL,
                text TEXT NOT NULL,
                text_english TEXT NOT NULL,

                FOREIGN KEY (video_id)
                    REFERENCES videos(video_id)
                    ON DELETE CASCADE,

                UNIQUE (video_id, start_seconds, text)
            );

            CREATE INDEX IF NOT EXISTS idx_segments_video
                ON transcript_segments(video_id);

            CREATE INDEX IF NOT EXISTS idx_segments_start
                ON transcript_segments(video_id, start_seconds);

            CREATE INDEX IF NOT EXISTS idx_videos_status
                ON videos(transcript_status);
        """)

    print(f"Database initialized: {DB_PATH}")


if __name__ == "__main__":
    init_db()

