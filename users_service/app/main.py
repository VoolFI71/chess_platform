import logging
from pathlib import Path

from fastapi import FastAPI

from common import configure_observability

from .config import get_settings
from .database import get_db, sync_engine
from .routers import friendships_router, users_router


logger = logging.getLogger(__name__)
settings = get_settings()

app = FastAPI(title=settings.app_name)

MIGRATIONS_PATH = Path(__file__).resolve().parent / "migrations" / "versions"


def apply_sql_migrations() -> None:
	if not MIGRATIONS_PATH.is_dir():
		logger.warning("Migrations directory not found: %s", MIGRATIONS_PATH)
		return

	migration_files = sorted(MIGRATIONS_PATH.glob("*.sql"))
	logger.info("Found %d migration file(s)", len(migration_files))
	
	for sql_file in migration_files:
		logger.info("Applying migration: %s", sql_file.name)
		sql = sql_file.read_text(encoding="utf-8").strip()
		if not sql:
			logger.warning("Migration file %s is empty, skipping", sql_file.name)
			continue
		try:
			with sync_engine.begin() as conn:
				conn.exec_driver_sql(sql)
			logger.info("Migration %s applied successfully", sql_file.name)
		except Exception as e:
			logger.error("Failed to apply migration %s: %s", sql_file.name, e, exc_info=True)
			raise


@app.on_event("startup")
def run_startup_tasks() -> None:
	apply_sql_migrations()


configure_observability(
	app,
	settings=settings,
	get_db=get_db,
	extra_checks={},
)

app.include_router(users_router)
app.include_router(friendships_router)


