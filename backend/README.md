# Legislative Reporter Backend

A FastAPI backend for ingesting legislative proceeding transcripts,
preserving timestamped source segments, translating Malayalam into
English, and preparing data for evidence-backed legislative reports.

> **Current scope:** YouTube transcript ingestion through SerpApi,
> text/subtitle/PDF uploads, SQLite persistence, and OpenAI-powered
> contextual translation. Summarization and report-generation endpoints
> can be added as the project develops.

## Architecture

``` text
YouTube channel/video
        |
        v
yt-dlp video discovery (channel ingestion script)
        |
        v
SerpApi YouTube Transcript API
        |
        v
Timestamped Malayalam transcript segments
        |
        v
OpenAI API (gpt-4o-mini)
Context-aware Malayalam -> English translation
        |
        v
SQLite database
  - videos
  - transcript_segments
        |
        v
Future: search, summarization, evidence-linked reports
```

For uploaded files, the FastAPI ingestion endpoint accepts supported
text, subtitle, and PDF formats. PDF text extraction uses `pypdf`, with
OCR fallback where configured.

## Main components

  -----------------------------------------------------------------------
  File / component                    Responsibility
  ----------------------------------- -----------------------------------
  `main.py`                           FastAPI application and HTTP
                                      endpoints

  `database.py`                       SQLite connection, schema
                                      initialization, and migrations

  `ingest_channel.py`                 Discovers channel videos, retrieves
                                      transcripts, translates them, and
                                      stores results

  `translator.py`                     Calls the OpenAI API to translate
                                      batches of Malayalam segments with
                                      neighboring context

  `.env`                              Local API keys and configuration;
                                      never commit this file

  `data/legislative.db`               SQLite database created by the
                                      application

  `data/jobs/`                        Persisted ingestion job data, if
                                      enabled by the current `main.py`

  `uploads/`                          Uploaded source files, if enabled
                                      by the current configuration
  -----------------------------------------------------------------------

File names and optional directories may vary as the implementation
evolves. Keep this README in sync with the actual code.

## Requirements

-   Python 3.12 or another Python version supported by the installed
    dependencies.
-   `pip` and Python virtual environments.
-   A SerpApi API key for YouTube transcript retrieval.
-   An OpenAI API key for contextual translation.
-   `yt-dlp` for channel video discovery.
-   `ffmpeg` and Tesseract OCR if your PDF/media processing
    configuration requires them.

OpenAI API usage is billed separately from a ChatGPT subscription. Check
that the API key belongs to the organization/project with the intended
credits and limits.

## Setup

Run these commands from the backend directory.

### 1. Create and activate a virtual environment

If the project already has a working `.venv`, activate it instead of
creating another one.

``` bash
python -m venv .venv
source .venv/bin/activate
python -m pip install --upgrade pip
```

### 2. Install dependencies

``` bash
python -m pip install \
  fastapi \
  "uvicorn[standard]" \
  requests \
  python-dotenv \
  python-multipart \
  pypdf \
  yt-dlp \
  openai
```

If OCR is used, install the required system tools on Arch Linux:

``` bash
sudo pacman -S ffmpeg tesseract tesseract-data-eng tesseract-data-mal
```

Package names for Malayalam OCR data may vary by repository. If the
Malayalam language pack is unavailable under that name, search your
configured repositories for the corresponding Tesseract Malayalam data
package.

### 3. Configure environment variables

Create a `.env` file in the location expected by the code. The examples
below assume the backend project root contains `.env`.

``` dotenv
SERPAPI_KEY=replace_with_your_serpapi_key
OPENAI_API_KEY=replace_with_your_openai_api_key
TRANSLATION_MODEL=gpt-4o-mini

YOUTUBE_CHANNEL_URL=https://www.youtube.com/@SabhaTV-KLA/videos
TRANSCRIPT_LANGUAGE=ml
MAX_VIDEOS=100
```

Do not add spaces around the `=` signs. Keep real keys private.

Add these entries to `.gitignore`:

``` gitignore
.env
.venv/
__pycache__/
*.py[cod]
data/
uploads/
```

Only ignore `data/` and `uploads/` if you do not intend to version
sample data. Do not commit credentials or private user uploads.

### 4. Initialize the database

From the directory containing `database.py`:

``` bash
python database.py
```

This should create the SQLite database at `data/legislative.db` and
initialize the schema. If the project has an explicit migration
function, run it as documented in that module.

### 5. Start the FastAPI server

If `main.py` defines the FastAPI object as `app`:

``` bash
uvicorn main:app --reload
```

If `main.py` is in another directory, run the command from the directory
containing it or adjust the module path. The `--reload` option is
intended for development, not production.

The API will usually be available at:

-   API base: `http://127.0.0.1:8000`
-   Interactive Swagger docs: `http://127.0.0.1:8000/docs`
-   OpenAPI schema: `http://127.0.0.1:8000/openapi.json`

## Current HTTP endpoints

The endpoints below reflect the backend implementation currently
documented in this project. The live OpenAPI schema at `/openapi.json`
and Swagger UI at `/docs` are the source of truth if routes change.

  --------------------------------------------------------------------------------------------
  Method                  Endpoint                                     Purpose
  ----------------------- -------------------------------------------- -----------------------
  `GET`                   `/health`                                    Health/status check

  `POST`                  `/api/ingest`                                Upload and ingest a
                                                                       supported text,
                                                                       subtitle, or PDF file

  `POST`                  `/api/ingest/youtube`                        Ingest a YouTube video
                                                                       transcript using
                                                                       SerpApi

  `GET`                   `/api/videos`                                List transcript videos

  `POST`                  `/api/videos/{video_id}/summary`             Generate or retrieve a
                                                                       transcript-cited summary

  `GET`                   `/api/jobs/{job_id}`                         Retrieve the
                                                                       status/details for an
                                                                       ingestion job

  `GET`                   `/api/jobs/{job_id}/segments/{segment_id}`   Retrieve a specific
                                                                       transcript segment for
                                                                       a job
  --------------------------------------------------------------------------------------------

### `GET /health`

``` bash
curl -i http://127.0.0.1:8000/health
```

### `POST /api/ingest/youtube`

Submit JSON, not multipart form data:

``` bash
curl -X POST http://127.0.0.1:8000/api/ingest/youtube \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://www.youtube.com/watch?v=u0_y5sjNDNo",
    "language_code": "ml"
  }'
```

The response structure depends on the current `main.py` implementation.
Use Swagger UI to inspect required fields and the response.

### Transcript summaries with timestamp citations

`GET /api/videos` lists up to 10 latest videos that have transcript
segments. `POST /api/videos/{video_id}/summary` creates a concise summary
from all stored segments for that video, or returns its saved summary.
Every sentence includes citations to source segment IDs and timestamps.
The JSON summary is persisted in the `videos.summary` column. The column is
added automatically to existing databases and included when a new database
is initialized. Set `OPENAI_API_KEY` (and optionally `SUMMARY_MODEL`) to
enable summary generation.

The frontend must be built with `VITE_API_BASE_URL` set to the reachable
backend URL. For a phone on the same Wi-Fi as a development computer, use
that computer's LAN address and allow the phone's origin in
`FRONTEND_ORIGINS`; `localhost` on the phone points to the phone itself.

## Export transcript segments to CSV

After a video transcript has been ingested, export the latest 20 segments
from the backend directory with:

``` powershell
python export_transcript_segments.py
```

The script writes `transcript_segments.csv` beside itself as UTF-8 with a
BOM so Malayalam text opens correctly in Excel. It reads directly from
`data/legislative.db` and does not pass transcript text through PowerShell's
native-command output encoding. Run it again after ingesting more videos to
refresh the export.

### `POST /api/ingest`

Upload a supported source file using multipart form data. The exact form
field name and accepted extensions are defined in `main.py`; inspect
`/docs` for the active schema. For example, if the upload field is named
`file`:

``` bash
curl -X POST http://127.0.0.1:8000/api/ingest \
  -F "file=@transcript.srt"
```

The documented implementation supports `.txt`, `.srt`, `.vtt`, and
`.pdf`. Audio/video upload should not be assumed to be enabled.

### `GET /api/jobs/{job_id}`

``` bash
curl http://127.0.0.1:8000/api/jobs/YOUR_JOB_ID
```

### `GET /api/jobs/{job_id}/segments/{segment_id}`

``` bash
curl http://127.0.0.1:8000/api/jobs/YOUR_JOB_ID/segments/YOUR_SEGMENT_ID
```

The IDs and response format must match the values returned by the
current API.

## Channel ingestion (SQLite population)

`ingest_channel.py` is a separate batch script for discovering recent
videos from a configured YouTube channel, retrieving transcripts,
translating segments, and saving them to SQLite.

1.  Set `YOUTUBE_CHANNEL_URL`, `SERPAPI_KEY`, `OPENAI_API_KEY`,
    `TRANSCRIPT_LANGUAGE`, and `MAX_VIDEOS` in `.env`.
2.  Test with a small number of videos first, such as `MAX_VIDEOS=1` or
    `2`.
3.  Initialize the database.
4.  Run:

``` bash
python ingest_channel.py
```

5.  Inspect progress and errors in the terminal.
6.  Increase `MAX_VIDEOS` after validating the output and API usage.

The script may skip videos already marked as completed. If a video
fails, inspect its `transcript_error` in SQLite before retrying.

Example database checks:

``` bash
sqlite3 data/legislative.db
```

``` sql
SELECT COUNT(*) FROM videos;

SELECT transcript_status, COUNT(*)
FROM videos
GROUP BY transcript_status;

SELECT COUNT(*) FROM transcript_segments;

SELECT
    v.title,
    s.start_seconds,
    s.end_seconds,
    s.text,
    s.text_english
FROM transcript_segments AS s
JOIN videos AS v ON v.video_id = s.video_id
LIMIT 10;
```

Exit SQLite with `.quit`.

## Translation design

-   Original Malayalam text should remain unchanged in
    `transcript_segments.text`.
-   English translations are stored in
    `transcript_segments.text_english`.
-   The translator groups consecutive segments and includes neighboring
    segments as context, because captions may split sentences across
    segment boundaries.
-   Each translation should remain associated with its original segment
    and timestamp.
-   Context improves interpretation but does not guarantee perfect
    translations. Verify important quotations, names, numbers, negation,
    and legal/political terminology against the original audio.
-   For reliability at scale, save each successfully translated batch to
    the database and mark a video completed only after every segment is
    stored. Avoid deleting all saved segments when retrying a failed
    batch.

## Troubleshooting

### `OPENAI_API_KEY` is missing

Make sure `.env` is in the path loaded by `translator.py`. If the `.env`
file is one directory above `backend/`, load it explicitly:

``` python
from pathlib import Path
from dotenv import load_dotenv

PROJECT_ROOT = Path(__file__).resolve().parent.parent
load_dotenv(PROJECT_ROOT / ".env")
```

Then initialize the client:

``` python
import os
from openai import OpenAI

api_key = os.getenv("OPENAI_API_KEY")
if not api_key:
    raise RuntimeError("OPENAI_API_KEY is not configured")

client = OpenAI(api_key=api_key)
```

Never print the key itself in logs.

### `422 Unprocessable Content` on YouTube ingestion

The `/api/ingest/youtube` endpoint expects a JSON body. Send
`Content-Type: application/json` and `JSON.stringify(...)` from
JavaScript, rather than using `FormData`.

### SQLite says `no such column`

`CREATE TABLE IF NOT EXISTS` does not alter an existing table. Add a
migration that checks `PRAGMA table_info(table_name)` and adds the
missing column with `ALTER TABLE`, or recreate the database only if
existing data can safely be discarded.

### No rows appear in a query

Check that the script and SQLite CLI are opening the same database file.
The configured path `data/legislative.db` is relative to the process
working directory unless the code resolves it to an absolute path.

### Translation batch fails

Inspect the error. Model responses can occasionally omit an ID. Retry
only the missing IDs and persist completed batches immediately so a
later failure does not require retranslating the entire video.

### Only one video is discovered

Check the channel URL, yt-dlp output, channel accessibility, and current
playlist extraction options. Confirm the discovered IDs before spending
transcript API credits on a large run.

## Security and operational notes

-   Keep `.env`, API keys, and private uploaded files out of version
    control.
-   Add rate limiting, authentication, upload size limits, and stricter
    error handling before exposing the API publicly.
-   Store source URLs and timestamps alongside claims in future
    report-generation features.
-   Treat generated translations and summaries as derived data, not as
    authoritative evidence.
-   Back up the SQLite database before migrations or bulk ingestion.
-   Check current provider pricing and API quotas before large batch
    jobs.

## Planned endpoints and architecture additions

These are planned placeholders, not active endpoints yet.

  -------------------------------------------------------------------------------------------
  Method            Proposed endpoint                     Status            Purpose
  ----------------- ------------------------------------- ----------------- -----------------
  `GET`             `/api/videos`                         Planned           List ingested
                                                                            videos with
                                                                            pagination

  `GET`             `/api/videos/{video_id}/transcript`   Planned           Retrieve a
                                                                            video's bilingual
                                                                            transcript

  `GET`             `/api/search`                         Planned           Search transcript
                                                                            text

  `POST`            `/api/reports`                        Planned           Generate an
                                                                            evidence-backed
                                                                            legislative
                                                                            report

  `GET`             `/api/reports/{report_id}`            Planned           Retrieve a
                                                                            generated report
                                                                            and its citations
  -------------------------------------------------------------------------------------------

Update the endpoint table whenever a route is added, removed, or changes
its request/response schema.
