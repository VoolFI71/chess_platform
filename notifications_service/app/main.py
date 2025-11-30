from pathlib import Path

import time
from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import notifications_router, notifications_ws_router


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
                print(f"Database connection restored after: {last_error}")
            return
        except Exception as exc:  # noqa: BLE001 - log and retry
            last_error = exc
            print(f"Database not ready yet (retrying in {retry_interval:.1f}s): {exc}")
            time.sleep(retry_interval)
    raise RuntimeError("Database is not reachable") from last_error


def apply_migrations() -> None:
    _wait_for_database()
    alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
    alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
    command.upgrade(alembic_cfg, "head")


@app.on_event("startup")
def run_startup_tasks() -> None:
    apply_migrations()


configure_observability(
    app,
    settings=settings,
    get_db=get_db,
    extra_checks={},
)

app.include_router(notifications_router)
app.include_router(notifications_ws_router)

