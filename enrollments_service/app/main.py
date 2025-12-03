import asyncio
import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from sqlalchemy import inspect

from common import configure_observability, setup_logging

from .config import get_settings
from .database import get_db, sync_engine
from .routers import enrollments_router


setup_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(title=settings.app_name)

# Оптимизация сетевой задержки: GZip сжатие для JSON ответов
app.add_middleware(GZipMiddleware, minimum_size=500)

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
	_wait_for_tables(("users", "courses"))
	logger.info("Applying database migrations...")
	alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
	alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
	alembic_cfg.set_main_option("version_table", "alembic_version_enrollments")
	command.upgrade(alembic_cfg, "head")
	logger.info("Database migrations applied successfully")


@app.on_event("startup")
async def run_startup_tasks() -> None:
	logger.info("Enrollments service startup initiated")
	# Migrations are now handled by the centralized migrations_service
	# Uncomment the following lines if you need to run migrations here:
	# try:
	# 	await asyncio.to_thread(apply_migrations)
	# 	logger.info("Enrollments service startup completed")
	# except (SystemExit, Exception) as exc:
	# 	logger.exception("Error during startup tasks: %s", exc)
	# 	logger.error("Server will continue despite migration errors")
	logger.info("Enrollments service startup completed")


configure_observability(app, settings=settings, get_db=get_db)

app.include_router(enrollments_router)
