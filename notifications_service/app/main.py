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
from .routers import notifications_router, notifications_ws_router


setup_logging()
logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(title=settings.app_name)

# Оптимизация сетевой задержки: GZip сжатие для JSON ответов
app.add_middleware(GZipMiddleware, minimum_size=500)

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
        except Exception as exc:  # noqa: BLE001 - log and retry
            last_error = exc
            logger.warning(
                "Database not ready yet (retrying in %.1fs): %s", retry_interval, exc
            )
            time.sleep(retry_interval)
    logger.error("Database is not reachable after %.1fs", timeout)
    raise RuntimeError("Database is not reachable") from last_error


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
    _wait_for_tables(("users",))
    logger.info("Applying database migrations...")
    _wait_for_database()
    alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    alembic_cfg.set_main_option("version_table", "alembic_version_notifications")
    command.upgrade(alembic_cfg, "head")
    logger.info("Database migrations applied successfully")


@app.on_event("startup")
async def run_startup_tasks() -> None:
    logger.info("Notifications service startup initiated")
    # Migrations are now handled by the centralized migrations_service
    # Uncomment the following lines if you need to run migrations here:
    # try:
    #     await asyncio.to_thread(apply_migrations)
    #     logger.info("Notifications service startup completed")
    # except (SystemExit, Exception) as exc:
    #     logger.exception("Error during startup tasks: %s", exc)
    #     logger.error("Server will continue despite migration errors")
    logger.info("Notifications service startup completed")


configure_observability(
    app,
    settings=settings,
    get_db=get_db,
    extra_checks={},
)

app.include_router(notifications_router)
app.include_router(notifications_ws_router)

