import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import attempts_router, importer_router, puzzles_router, stats_router

settings = get_settings()
app = FastAPI(title=settings.app_name)
logger = logging.getLogger(__name__)

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
    raise RuntimeError("Database is not reachable") from last_error


def apply_migrations() -> None:
    _wait_for_database()
    alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(alembic_cfg, "head")


@app.on_event("startup")
async def on_startup() -> None:
    apply_migrations()
    logger.info("Сервис запущен")


configure_observability(
    app,
    settings=settings,
    get_db=get_db,
    extra_checks={},
)

app.include_router(puzzles_router)
app.include_router(attempts_router)
app.include_router(stats_router)
app.include_router(importer_router)

