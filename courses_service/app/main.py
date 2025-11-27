import httpx
import logging
import time
from pathlib import Path

from fastapi import FastAPI
from sqlalchemy.orm import Session

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import courses_router


logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(title=settings.app_name)

MIGRATIONS_PATH = Path(__file__).resolve().parent / "migrations" / "versions"


def _wait_for_database(timeout: float = 60.0, retry_interval: float = 2.0) -> None:
	"""Block startup until the primary database becomes reachable."""
	deadline = time.time() + timeout
	last_error: Exception | None = None
	while time.time() < deadline:
		try:
			with sync_engine.begin() as conn:
				conn.exec_driver_sql("SELECT 1")
			if last_error:
				logger.info("Database connection restored after: %s", last_error)
			return
		except Exception as exc:  # noqa: BLE001 - log and retry
			last_error = exc
			logger.warning(
				"Database not ready yet (retrying in %.1fs): %s", retry_interval, exc
			)
			time.sleep(retry_interval)
	raise RuntimeError("Database is not reachable") from last_error


def apply_sql_migrations() -> None:
	_wait_for_database()
	if not MIGRATIONS_PATH.is_dir():
		return

	for sql_file in sorted(MIGRATIONS_PATH.glob("*.sql")):
		sql = sql_file.read_text(encoding="utf-8").strip()
		if not sql:
			continue
		with sync_engine.begin() as conn:
			conn.exec_driver_sql(sql)


@app.on_event("startup")
def run_startup_tasks() -> None:
	apply_sql_migrations()


async def _check_enrollments(_: Session) -> None:
	if not settings.enrollments_service_url:
		return
	url = settings.enrollments_service_url.rstrip("/") + "/healthz"
	headers: dict[str, str] = {}
	if settings.enrollments_internal_token:
		headers["X-Internal-Token"] = settings.enrollments_internal_token
	async with httpx.AsyncClient(timeout=2.0) as client:
		response = await client.get(url, headers=headers)
		response.raise_for_status()


configure_observability(
	app,
	settings=settings,
	get_db=get_db,
	extra_checks={"enrollments_service": _check_enrollments},
)

app.include_router(courses_router)
