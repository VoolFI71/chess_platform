from hashlib import md5
from mimetypes import guess_type
from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import FileResponse, JSONResponse

from common.observability import configure_observability

from .config import get_settings
from .routers import notifications, stats


settings = get_settings()

app = FastAPI(title=settings.app_name)

# Оптимизация сетевой задержки: GZip сжатие для статических файлов и JSON ответов
# Порог 1000 байт оптимален для статических файлов (HTML, CSS, JS)
app.add_middleware(GZipMiddleware, minimum_size=1000)

configure_observability(app, settings=settings, get_db=None)

# Include routers
app.include_router(stats.router)
app.include_router(notifications.router)


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


def _serve_file(path: Path, request: Request = None):
    media_type = _detect_media_type(path)
    response = FileResponse(str(path))
    if media_type:
        response.headers["Content-Type"] = media_type
    
    # Добавляем ETag для правильного кеширования статических файлов
    # Браузер будет проверять изменения через If-None-Match
    try:
        stat = path.stat()
        # Создаем ETag на основе пути и времени модификации
        etag_data = f"{path.name}{stat.st_mtime}{stat.st_size}"
        etag = md5(etag_data.encode()).hexdigest()
        response.headers["ETag"] = f'"{etag}"'
        
        # Определяем режим разработки (dev/prod)
        # В dev режиме отключаем кеширование для JS/CSS для удобства разработки
        is_dev = getattr(settings, 'environment', 'development').lower() == 'development'
        
        # Для CSS и JS файлов: длительное кеширование с проверкой через ETag (в prod)
        # В dev режиме: no-cache для немедленного обновления
        if path.suffix in {".css", ".js", ".woff", ".woff2", ".ttf", ".eot", ".svg", ".png", ".jpg", ".jpeg", ".gif", ".ico", ".webp"}:
            if is_dev:
                # В режиме разработки: no-cache для JS/CSS файлов
                response.headers["Cache-Control"] = "no-cache, no-store, must-revalidate"
                response.headers["Pragma"] = "no-cache"
                response.headers["Expires"] = "0"
            else:
                # В продакшене: длительное кеширование
                response.headers["Cache-Control"] = "public, max-age=31536000, must-revalidate"
        else:
            # Для HTML и других файлов: короткое кеширование
            response.headers["Cache-Control"] = "public, max-age=3600, must-revalidate"
        
        # Проверяем If-None-Match для поддержки 304 Not Modified (только в prod)
        if not is_dev and request and request.headers.get("if-none-match") == f'"{etag}"':
            from fastapi import Response
            return Response(status_code=304)
    except (OSError, AttributeError):
        # Если не удалось получить статистику файла, используем базовое кеширование
        response.headers["Cache-Control"] = "public, max-age=3600"
    
    return response


@app.get("/coach")
def serve_coach_default(request: Request):
    # Redirect /coach to /coach/grisha (default coach)
    from fastapi.responses import RedirectResponse
    return RedirectResponse(url="/coach/grisha", status_code=301)

@app.get("/coach/{coach_slug}")
def serve_coach_by_slug(coach_slug: str, request: Request):
    # Always serve coach.html for pretty URL, frontend reads coach slug from path
    coach_file = WEB_DIR / "coach.html"
    if not coach_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    # Frontend JavaScript will parse coach_slug from window.location.pathname
    return _serve_file(coach_file, request)

@app.get("/course/{course_id}")
def serve_course_by_id(course_id: int, request: Request):
    # Always serve course.html for pretty URL, frontend reads courseId from path
    course_file = WEB_DIR / "course.html"
    if not course_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    # Inject no special headers; course.js will parse window.location.pathname
    return _serve_file(course_file, request)


@app.get("/games")
@app.get("/games/")
def serve_games_page(request: Request):
    games_file = WEB_DIR / "games.html"
    if not games_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(games_file, request)


@app.get("/match/{match_id}")
def serve_match_page(match_id: str, request: Request):
    match_file = WEB_DIR / "match.html"
    if not match_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(match_file, request)


@app.get("/profile")
def serve_profile_page(request: Request):
    # Always serve profile.html for pretty URL, frontend reads username from path
    profile_file = WEB_DIR / "profile.html"
    if not profile_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(profile_file, request)


@app.get("/profile/{username}")
def serve_profile_page_with_username(username: str, request: Request):
    # Block access to URLs with .html extension
    if username.endswith('.html'):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    
    # Always serve profile.html for pretty URL, frontend reads username from path
    profile_file = WEB_DIR / "profile.html"
    if not profile_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(profile_file, request)


@app.get("/daily")
def serve_daily_page(request: Request):
    """Serve daily puzzle page."""
    daily_file = WEB_DIR / "daily.html"
    if not daily_file.is_file():
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(daily_file, request)


@app.get("/favicon.ico")
def serve_favicon_ico():
    """Serve favicon.ico - для Яндекс Вебмастера должен быть настоящий ICO файл"""
    # Приоритет 1: Настоящий ICO файл (рекомендуется Яндексом)
    ico_path = WEB_DIR / "favicon.ico"
    if ico_path.is_file():
        response = FileResponse(str(ico_path))
        response.headers["Content-Type"] = "image/x-icon"
        return response
    
    # Fallback 1: PNG файл (если ICO еще не создан)
    png_path = WEB_DIR / "favicon.png"
    if png_path.is_file():
        response = FileResponse(str(png_path))
        response.headers["Content-Type"] = "image/png"
        return response
    
    # Fallback 2: SVG файл
    svg_path = WEB_DIR / "favicon.svg"
    if svg_path.is_file():
        response = FileResponse(str(svg_path))
        response.headers["Content-Type"] = "image/svg+xml; charset=utf-8"
        return response
    
    return JSONResponse({"detail": "Not Found"}, status_code=404)


@app.get("/{full_path:path}")
def serve_frontend(full_path: str, request: Request):
    # Don't serve API routes as static files
    if full_path.startswith("api/"):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    
    # Block access to .html files directly
    if full_path.endswith('.html'):
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    
    resolved = _resolve_web_path(full_path)
    if resolved is None:
        return JSONResponse({"detail": "Not Found"}, status_code=404)
    return _serve_file(resolved, request)
