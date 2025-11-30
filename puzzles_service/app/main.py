import logging
from pathlib import Path

from fastapi import FastAPI

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import attempts_router, importer_router, puzzles_router, stats_router

settings = get_settings()
app = FastAPI(title=settings.app_name)
logger = logging.getLogger(__name__)

MIGRATIONS_PATH = Path(__file__).resolve().parent / "migrations" / "versions"


def apply_sql_migrations() -> None:
	if not MIGRATIONS_PATH.is_dir():
		return

	for sql_file in sorted(MIGRATIONS_PATH.glob("*.sql")):
		sql = sql_file.read_text(encoding="utf-8").strip()
		if not sql:
			continue
		with sync_engine.begin() as conn:
			conn.exec_driver_sql(sql)


@app.on_event("startup")
async def on_startup() -> None:
	apply_sql_migrations()
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

