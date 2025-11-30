import time
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from sqlalchemy import inspect

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import enrollments_router


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


def apply_migrations() -> None:
	_wait_for_tables(("users", "courses"))
	alembic_cfg = AlembicConfig(str(ALEMBIC_INI_PATH))
	alembic_cfg.set_main_option("sqlalchemy.url", settings.database_url)
	command.upgrade(alembic_cfg, "head")


@app.on_event("startup")
def run_startup_tasks() -> None:
	apply_migrations()


configure_observability(app, settings=settings, get_db=get_db)

app.include_router(enrollments_router)
