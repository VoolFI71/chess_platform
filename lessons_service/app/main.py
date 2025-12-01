import asyncio
import time
from pathlib import Path

import httpx
import logging

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from sqlalchemy import inspect

from common import configure_observability, setup_logging

from .config import get_settings
from .database import get_db, sync_engine
from .routers import lessons_router, pgn_files_router
from .enrollments_client import close_enrollments_client


setup_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(title=settings.app_name)

ALEMBIC_INI_PATH = Path(__file__).resolve().parent.parent / "alembic.ini"


def _wait_for_tables(tables: tuple[str, ...], timeout: float = 60.0) -> None:
	if not tables:
		return
	deadline = time.time() + timeout
	while time.time() < deadline:
		inspector = inspect(sync_engine)
		if all(inspector.has_table(name) for name in tables):
			return
		time.sleep(1)
	logger.error("Required tables %s not available after %.1fs", tables, timeout)
	raise RuntimeError(f"Dependent tables {tables} are not ready")


def apply_migrations() -> None:
	logger.info("Waiting for dependent tables before applying migrations...")
	_wait_for_tables(("courses",))
	logger.info("Applying database migrations...")
	alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
	alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
	command.upgrade(alembic_cfg, "head")
	logger.info("Database migrations applied successfully")


@app.on_event("startup")
async def run_startup_tasks() -> None:
	logger.info("Lessons service startup initiated")
	try:
		await asyncio.to_thread(apply_migrations)
	logger.info("Lessons service startup completed")
	except (SystemExit, Exception) as exc:
		logger.exception("Error during startup tasks: %s", exc)
		logger.error("Server will continue despite migration errors")


@app.on_event("shutdown")
async def shutdown_http_clients() -> None:
	logger.info("Lessons service shutdown initiated")
	await close_enrollments_client()
	logger.info("Lessons service shutdown completed")


async def _check_enrollments(_: object) -> None:
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

app.include_router(lessons_router)
app.include_router(pgn_files_router)
