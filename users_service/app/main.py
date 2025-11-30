import asyncio
import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI

from common import configure_observability, setup_logging

from .config import get_settings
from .database import get_db, sync_engine
from .routers import friendships_router, internal_users_router, users_router
from .routers.users import close_games_client


setup_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(title=settings.app_name)

ALEMBIC_INI_PATH = Path(__file__).resolve().parent.parent / "alembic.ini"


def _wait_for_database(timeout: float = 60.0, retry_interval: float = 2.0) -> None:
	deadline = time.time() + timeout
	last_error: Exception | None = None
	while time.time() < deadline:
		try:
			with sync_engine.begin() as conn:
				conn.exec_driver_sql("SELECT 1")
			if last_error:
				logger.info("Database connection restored after: %s", last_error)
			return
		except Exception as exc:  # noqa: BLE001
			last_error = exc
			logger.warning(
				"Database not ready yet (retrying in %.1fs): %s", retry_interval, exc
			)
			time.sleep(retry_interval)
	logger.error("Database is not reachable after %.1fs", timeout)
	raise RuntimeError("Database is not reachable") from last_error


def apply_migrations() -> None:
	logger.info("Applying database migrations...")
	_wait_for_database()
	alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
	alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
	command.upgrade(alembic_cfg, "head")
	logger.info("Database migrations applied successfully")


@app.on_event("startup")
async def run_startup_tasks() -> None:
	logger.info("Users service startup initiated")
	try:
		await asyncio.to_thread(apply_migrations)
		logger.info("Users service startup completed")
	except (SystemExit, Exception) as exc:
		logger.exception("Error during startup tasks: %s", exc)
		logger.error("Server will continue despite migration errors")


@app.on_event("shutdown")
async def shutdown_http_clients() -> None:
	logger.info("Users service shutdown initiated")
	await close_games_client()
	logger.info("Users service shutdown completed")


configure_observability(
	app,
	settings=settings,
	get_db=get_db,
	extra_checks={},
)

app.include_router(users_router)
app.include_router(friendships_router)
app.include_router(internal_users_router)


