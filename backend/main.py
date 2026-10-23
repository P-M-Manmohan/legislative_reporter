"""
Legislative Reporter API v0.4.0
YouTube transcript ingestion through SerpApi plus TXT/SRT/VTT/PDF uploads.
Local Whisper transcription has been removed.
"""
import json
import logging
import os
import re
import shutil
import subprocess
import tempfile
from datetime import datetime, timezone
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlparse
from uuid import uuid4

import requests
from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.concurrency import run_in_threadpool
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


class YouTubeIngestRequest(BaseModel):
    url: str = Field(..., min_length=5, max_length=2048)
    language_code: str = Field(default="ml", min_length=2, max_length=20)
    transcript_type: str | None = Field(default=None, description="Optional, e.g. asr")


def now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def video_id_from_url(value: str) -> str:
    value = value.strip()
    if re.fullmatch(r"[A-Za-z0-9_-]{11}", value):
        return value
    parsed = urlparse(value)
    host = (parsed.hostname or "").lower()
    video_id = None
    if host == "youtu.be" or host == "www.youtu.be":
        video_id = parsed.path.strip("/").split("/")[0]
    elif host.endswith("youtube.com") or host.endswith("youtube-nocookie.com"):
        if parsed.path == "/watch":
            video_id = parse_qs(parsed.query).get("v", [None])[0]
        else:
            match = re.match(r"^/(?:shorts|embed|live|v)/([A-Za-z0-9_-]{11})(?:/|$)", parsed.path)
            if match:
                video_id = match.group(1)
    if not video_id or not re.fullmatch(r"[A-Za-z0-9_-]{11}", video_id):
        raise ValueError("Provide a valid YouTube URL or 11-character video ID.")
    return video_id


def save_job(job: dict[str, Any]) -> None:
    path = JOBS_DIR / f"{job['job_id']}.json"
    temp = JOBS_DIR / f".{job['job_id']}.{uuid4().hex}.tmp"
    try:
        temp.write_text(json.dumps(job, ensure_ascii=False, indent=2), encoding="utf-8")
        temp.replace(path)
    finally:
        temp.unlink(missing_ok=True)


def load_job(job_id: str) -> dict[str, Any]:
    if not re.fullmatch(r"[A-Za-z0-9_-]{1,100}", job_id):
        raise HTTPException(status_code=400, detail="Invalid job ID.")
    path = JOBS_DIR / f"{job_id}.json"
    if not path.is_file():
        raise HTTPException(status_code=404, detail="Job not found.")
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as exc:
        logger.exception("Could not read job %s", job_id)
        raise HTTPException(status_code=500, detail="Could not read stored job.") from exc


def segment_id(job_id: str, index: int) -> str:
    return f"{job_id}-S{index:04d}"


def split_text(text: str, limit: int = CHUNK_SIZE) -> list[str]:
    text = re.sub(r"\s+", " ", text).strip()
    if not text:
        return []
    sentences = re.split(r"(?<=[.!?।])\s+", text)
    output, current = [], ""
    for sentence in sentences:
        if len(sentence) > limit:
            if current:
                output.append(current)
                current = ""
            words, part = sentence.split(), ""
            for word in words:
                candidate = f"{part} {word}".strip()
                if len(candidate) > limit and part:
                    output.append(part)
                    part = word
                else:
                    part = candidate
            current = part
        else:
            candidate = f"{current} {sentence}".strip()
            if len(candidate) > limit and current:
                output.append(current)
                current = sentence
            else:
                current = candidate
    if current:
        output.append(current)
    return output


# -------------------------- SerpApi transcript --------------------------

def fetch_transcript(video_id: str, language_code: str,
                     transcript_type: str | None) -> dict[str, Any]:
    api_key = os.getenv("SERPAPI_KEY") or os.getenv("SERPAPI_KEY")
    if not api_key:
        raise HTTPException(status_code=500,
                            detail="Set SERPAPI_KEY in your environment or .env file.")
    params = {
        "engine": "youtube_video_transcript",
        "v": video_id,
        "language_code": language_code,
        "api_key": api_key,
    }
    if transcript_type:
        params["type"] = transcript_type
    try:
        response = requests.get(SERPAPI_ENDPOINT, params=params, timeout=60)
    except requests.RequestException as exc:
        logger.warning("SerpApi connection failed: %s", exc)
        raise HTTPException(status_code=502, detail="Could not connect to SerpApi.") from exc
    if response.status_code == 401:
        raise HTTPException(status_code=502, detail="SerpApi rejected the API key.")
    if response.status_code == 429:
        raise HTTPException(status_code=429, detail="SerpApi rate limit reached.")
    if response.status_code >= 400:
        logger.warning("SerpApi HTTP %s: %s", response.status_code, response.text[:300])
        raise HTTPException(status_code=502, detail=f"SerpApi returned HTTP {response.status_code}.")
    try:
        data = response.json()
    except ValueError as exc:
        raise HTTPException(status_code=502, detail="SerpApi returned invalid JSON.") from exc
    if data.get("error"):
        raise HTTPException(status_code=422, detail={
            "message": str(data["error"]),
            "available_transcripts": data.get("available_transcripts", []),
            "hint": "Try a language listed in available_transcripts; omit transcript_type if set.",
        })
    items = data.get("transcript")
    if not isinstance(items, list) or not items:
        raise HTTPException(status_code=422, detail={
            "message": "No transcript returned for this video.",
            "available_transcripts": data.get("available_transcripts", []),
            "hint": "The clip may not have captions or the requested language may be unavailable.",
        })
    return data


def normalize_transcript(job_id: str, items: list[dict[str, Any]],
                         requested_language: str, data: dict[str, Any]) -> list[dict[str, Any]]:
    language = data.get("search_parameters", {}).get("language_code") or requested_language
    segments = []
    for item in items:
        text = str(item.get("snippet") or "").strip()
        if not text:
            continue
        try:
            start = float(item["start_ms"]) / 1000
            end = float(item.get("end_ms", item["start_ms"])) / 1000
        except (KeyError, TypeError, ValueError):
            logger.warning("Skipping transcript item without millisecond timestamps: %r", item)
            continue
        if start < 0 or end < start:
            continue
        segments.append({
            "segment_id": segment_id(job_id, len(segments) + 1),
            "start_seconds": round(start, 3),
            "end_seconds": round(end, 3),
            "start_time_text": item.get("start_time_text"),
            "speaker": None,
            "text": text,
            "language": language,
            "source_type": "youtube_caption",
            "review_status": "unreviewed",
            "avg_logprob": None,
        })
    return segments


@app.post("/api/ingest/youtube")
async def ingest_youtube(request: YouTubeIngestRequest):
    """Example body: {"url":"https://youtu.be/VIDEO_ID","language_code":"ml"}"""
    print(request)
    try:
        video_id = video_id_from_url(request.url)
        print(video_id)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

    data = await run_in_threadpool(
        fetch_transcript, video_id, request.language_code, request.transcript_type
    )
    job_id = str(uuid4())
    segments = normalize_transcript(job_id, data["transcript"], request.language_code, data)
    if not segments:
        raise HTTPException(status_code=422, detail="No usable timestamped transcript segments returned.")

    selected = next((x for x in data.get("available_transcripts", []) if x.get("selected")), {})
    job = {
        "job_id": job_id,
        "filename": None,
        "extension": None,
        "file_size_bytes": None,
        "created_at": now_iso(),
        "updated_at": now_iso(),
        "status": "completed",
        "source_type": "youtube",
        "source_url": f"https://www.youtube.com/watch?v={video_id}",
        "video_id": video_id,
        "requested_language": request.language_code,
        "transcript_type": request.transcript_type,
        "selected_transcript": selected,
        "available_transcripts": data.get("available_transcripts", []),
        "segment_count": len(segments),
        "page_count": None,
        "transcription": {
            "provider": "SerpApi",
            "engine": "youtube_video_transcript",
            "language": segments[0]["language"],
            "duration_seconds": max(s["end_seconds"] for s in segments),
        },
        "segments": segments,
    }
    save_job(job)
    return job


# -------------------------- TXT / SRT / VTT / PDF --------------------------

def parse_time(value: str) -> float:
    value = value.strip().replace(",", ".")
    parts = value.split(":")
    try:
        if len(parts) == 3:
            h, m, s = parts
            return int(h) * 3600 + int(m) * 60 + float(s)
        if len(parts) == 2:
            m, s = parts
            return int(m) * 60 + float(s)
    except ValueError:
        pass
    raise ValueError(f"Invalid timestamp: {value}")


def parse_subtitles(content: str) -> list[dict[str, Any]]:
    content = content.replace("\r\n", "\n").replace("\r", "\n")
    blocks = re.split(r"\n\s*\n", content.strip())
    pattern = re.compile(
        r"(?P<start>\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})\s*-->\s*"
        r"(?P<end>\d{1,2}:\d{2}(?::\d{2})?[,.]\d{1,3})"
    )
    result = []
    for block in blocks:
        lines = [line.strip("\ufeff ") for line in block.split("\n") if line.strip()]
        idx = next((i for i, line in enumerate(lines) if pattern.search(line)), None)
        if idx is None:
            continue
        match = pattern.search(lines[idx])
        text = re.sub(r"<[^>]+>", "", " ".join(lines[idx + 1:])).strip()
        if not match or not text:
            continue
        try:
            start, end = parse_time(match.group("start")), parse_time(match.group("end"))
        except ValueError:
            continue
        result.append({
            "start_seconds": round(start, 3),
            "end_seconds": round(max(start, end), 3),
            "speaker": None,
            "text": text,
            "language": None,
            "source_type": "uploaded_subtitle",
            "review_status": "unreviewed",
        })
    return result


def make_text_segments(job_id: str, text: str, source_type: str) -> list[dict[str, Any]]:
    return [{
        "segment_id": segment_id(job_id, i),
        "start_seconds": None,
        "end_seconds": None,
        "speaker": None,
        "text": chunk,
        "language": None,
        "source_type": source_type,
        "review_status": "unreviewed",
    } for i, chunk in enumerate(split_text(text), start=1)]


def ocr_pdf_page(path: Path, page_number: int) -> str:
    if not shutil.which("pdftoppm") or not shutil.which("tesseract"):
        return ""
    with tempfile.TemporaryDirectory(prefix="legislative_pdf_") as temp:
        prefix = Path(temp) / "page"
        subprocess.run([
            "pdftoppm", "-f", str(page_number), "-l", str(page_number),
            "-r", "300", "-png", "-singlefile", str(path), str(prefix),
        ], capture_output=True, text=True, check=True)
        image_path = prefix.with_suffix(".png")
        result = subprocess.run(
            ["tesseract", str(image_path), "stdout", "-l", "mal+eng", "--psm", "3"],
            capture_output=True, text=True, check=False,
        )
        if result.returncode:
            logger.warning("Tesseract failed on page %s: %s", page_number, result.stderr[:300])
            return ""
        return result.stdout.strip()


def extract_pdf_pages(path: Path) -> tuple[list[dict[str, Any]], int]:
    try:
        from pypdf import PdfReader
    except ImportError as exc:
        raise RuntimeError("PDF support requires pypdf: pip install pypdf") from exc
    reader = PdfReader(str(path))
    pages = []
    for page_number, page in enumerate(reader.pages, start=1):
        try:
            text = (page.extract_text() or "").strip()
        except Exception:
            text = ""
        letters = len(re.findall(r"[^\W\d_]", text, flags=re.UNICODE))
        if letters < 20:
            text = ocr_pdf_page(path, page_number)
        pages.append({"page_number": page_number, "text": text})
    return pages, len(reader.pages)


def make_pdf_segments(job_id: str, pages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    segments = []
    for page in pages:
        for chunk in split_text(page["text"]):
            segments.append({
                "segment_id": segment_id(job_id, len(segments) + 1),
                "start_seconds": None,
                "end_seconds": None,
                "speaker": None,
                "text": chunk,
                "language": None,
                "source_type": "pdf_text",
                "review_status": "unreviewed",
                "page_number": page["page_number"],
            })
    return segments


async def read_upload(file: UploadFile) -> bytes:
    content = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(content) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="File exceeds the 500 MB upload limit.")
    if not content:
        raise HTTPException(status_code=400, detail="Uploaded file is empty.")
    return content


@app.post("/api/ingest")
async def ingest_file(file: UploadFile = File(...)):
    filename = Path(file.filename or "upload").name
    extension = Path(filename).suffix.lower()
    if extension not in SUPPORTED_EXTENSIONS:
        raise HTTPException(
            status_code=415,
            detail="Supported uploads: TXT, SRT, VTT, PDF. Use /api/ingest/youtube for YouTube clips.",
        )
    content = await read_upload(file)
    job_id = str(uuid4())
    saved_path = UPLOAD_DIR / f"{job_id}{extension}"

    try:
        saved_path.write_bytes(content)
        if extension in {".srt", ".vtt"}:
            parsed = parse_subtitles(content.decode("utf-8-sig", errors="replace"))
            segments = [{
                **item, "segment_id": segment_id(job_id, i)
            } for i, item in enumerate(parsed, start=1)]
            source_type, page_count = "subtitle_file", None
        elif extension == ".txt":
            segments = make_text_segments(
                job_id, content.decode("utf-8-sig", errors="replace"), "text_file"
            )
            source_type, page_count = "text_file", None
        else:
            pages, page_count = await run_in_threadpool(extract_pdf_pages, saved_path)
            segments = make_pdf_segments(job_id, pages)
            source_type = "pdf_file"

        if not segments:
            raise HTTPException(
                status_code=422,
                detail="No usable text extracted. Check the file and OCR language support.",
            )
        job = {
            "job_id": job_id,
            "filename": filename,
            "extension": extension,
            "file_size_bytes": len(content),
            "created_at": now_iso(),
            "updated_at": now_iso(),
            "status": "completed",
            "source_type": source_type,
            "source_url": None,
            "video_id": None,
            "segment_count": len(segments),
            "page_count": page_count,
            "transcription": None,
            "segments": segments,
        }
        save_job(job)
        return job
    except HTTPException:
        raise
    except subprocess.CalledProcessError as exc:
        logger.exception("PDF OCR command failed")
        raise HTTPException(status_code=500, detail="PDF OCR failed; check Poppler and Tesseract.") from exc
    except Exception as exc:
        logger.exception("Ingestion failed for %s", filename)
        raise HTTPException(status_code=500, detail=f"Ingestion failed: {type(exc).__name__}: {exc}") from exc
    finally:
        await file.close()


# --------------------------------- Retrieval ---------------------------------

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
        "status": "ok",
        "version": APP_VERSION,
        "serpapi_configured": bool(os.getenv("SERPAPI_KEY") or os.getenv("SERPAPI_API_KEY")),
    }

