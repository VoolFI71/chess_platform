from mimetypes import guess_type
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from common.observability import configure_observability

from .config import get_settings
from .routers import stats


settings = get_settings()

app = FastAPI(title=settings.app_name)

# Оптимизация сетевой задержки: GZip сжатие для статических файлов и JSON ответов
# Порог 1000 байт оптимален для статических файлов (HTML, CSS, JS)
app.add_middleware(GZipMiddleware, minimum_size=1000)

configure_observability(app, settings=settings, get_db=None)

# Include routers
app.include_router(stats.router)


# Frontend serving
WEB_DIR = Path(settings.web_dir).resolve()


def _resolve_web_path(request_path: str) -> Path | None:
    # Normalize and prevent path traversal
    safe_path = Path(request_path.lstrip("/"))
    candidate = (WEB_DIR / safe_path).resolve()
    try:
        candidate.relative_to(WEB_DIR)
    except ValueError:
        return None

    if candidate.is_file():
        return candidate

    # try with .html when path is like /course
    html_candidate = candidate.with_suffix(".html")
    if html_candidate.is_file():
        return html_candidate

    # root -> index.html
    if request_path in ("", "/"):
        index = WEB_DIR / "index.html"
        if index.is_file():
            return index

    return None


def _detect_media_type(path: Path) -> str | None:
    # Explicitly set XML content type for sitemap
    if path.name == "sitemap.xml":
        return "application/xml; charset=utf-8"
    if path.name == "robots.txt":
        return "text/plain; charset=utf-8"
    media_type, _ = guess_type(path.name)
    if not media_type:
        ext = path.suffix.lower()
        if ext in {".js", ".mjs"}:
            media_type = "application/javascript"
        elif ext == ".css":
            media_type = "text/css"
        elif ext in {".html", ".htm"}:
            media_type = "text/html"
        elif ext == ".json":
            media_type = "application/json"
    if media_type and (
        media_type.startswith("text/")
        or media_type in {"application/javascript", "application/json"}
    ):
        return f"{media_type}; charset=utf-8"
    return media_type


def _serve_file(path: Path):
    media_type = _detect_media_type(path)
    response = FileResponse(str(path))
    if media_type:
        response.headers["Content-Type"] = media_type
    return response


@app.get("/course/{course_id}")
def serve_course_by_id(course_id: int):
    # Always serve course.html for pretty URL, frontend reads courseId from path
    course_file = WEB_DIR / "course.html"
    if not course_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    # Inject no special headers; course.js will parse window.location.pathname
    return _serve_file(course_file)


@app.get("/games")
@app.get("/games/")
def serve_games_page():
    games_file = WEB_DIR / "games.html"
    if not games_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(games_file)


@app.get("/match/{match_id}")
def serve_match_page(match_id: str):
    match_file = WEB_DIR / "match.html"
    if not match_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(match_file)


@app.get("/profile")
def serve_profile_page():
    # Always serve profile.html for pretty URL, frontend reads username from path
    profile_file = WEB_DIR / "profile.html"
    if not profile_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(profile_file)


@app.get("/profile/{username}")
def serve_profile_page_with_username(username: str):
    # Always serve profile.html for pretty URL, frontend reads username from path
    profile_file = WEB_DIR / "profile.html"
    if not profile_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(profile_file)


@app.get("/{full_path:path}")
def serve_frontend(full_path: str):
    # Don't serve API routes as static files
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    
    resolved = _resolve_web_path(full_path)
    if resolved is None:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(resolved)
