import asyncio
import time
from pathlib import Path

import logging

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import ORJSONResponse

from common import configure_observability, setup_logging

from .config import get_settings
from .database import get_db, sync_engine
from .routers import attempts_router, daily_solutions_router, importer_router, puzzles_router, stats_router

setup_logging()
settings = get_settings()
# Используем orjson для быстрой JSON сериализации (в 2-3 раза быстрее стандартного json)
app = FastAPI(
	title=settings.app_name,
	default_response_class=ORJSONResponse,  # Используем orjson вместо стандартного json
)

# Оптимизация сетевой задержки:
# 1. Gzip сжатие с оптимизированным порогом для баланса между сжатием и производительностью
#    - Порог 300 байт: оптимальный для JSON ответов (~360 байт), обеспечивает сжатие большинства ответов
#    - Стандартный GZipMiddleware использует уровень сжатия 6 (компромисс между скоростью и сжатием)
#    - Это уменьшает вариативность времени ответа и улучшает пропускную способность
app.add_middleware(GZipMiddleware, minimum_size=300)
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
    logger.error("Database is not reachable after %.1fs", timeout)
    raise RuntimeError("Database is not reachable") from last_error


def apply_migrations() -> None:
    logger.info("Applying database migrations...")
    _wait_for_database()
    alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    alembic_cfg.set_main_option("version_table", "alembic_version_puzzles")
    command.upgrade(alembic_cfg, "head")
    logger.info("Database migrations applied successfully")


@app.on_event("startup")
async def on_startup() -> None:
    logger.info("Puzzles service startup initiated")
    # Migrations are now handled by the centralized migrations_service
    # Uncomment the following lines if you need to run migrations here:
    # try:
    #     await asyncio.to_thread(apply_migrations)
    #     logger.info("Puzzles service startup completed")
    # except (SystemExit, Exception) as exc:
    #     logger.exception("Error during startup tasks: %s", exc)
    #     logger.error("Server will continue despite migration errors")
    logger.info("Puzzles service startup completed")


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
app.include_router(daily_solutions_router)

