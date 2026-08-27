import asyncio
import logging
import time
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from fastapi import FastAPI
from fastapi.middleware.gzip import GZipMiddleware

from common import configure_observability, setup_logging

from .config import get_settings
from .database import get_db, sync_engine
from .routers import internal_users_router, ratings_router, schools_router, users_router
from .routers.users import close_games_client


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
	alembic_cfg.set_main_option("version_table", "alembic_version_users")
	
	# Проверяем, существует ли таблица users, но нет записи в alembic_version
	# Если таблица существует, но версия не проставлена, проставляем начальную версию
	try:
		from sqlalchemy import inspect, text
		inspector = inspect(sync_engine)
		
		# Проверяем существование таблицы users
		if inspector.has_table("users"):
			# Проверяем, есть ли запись в таблице версий
			with sync_engine.begin() as conn:
				result = conn.execute(
					text("SELECT COUNT(*) FROM alembic_version_users")
				)
				count = result.scalar()
				
				if count == 0:
					# Таблица существует, но версия не проставлена - проставляем начальную версию
					logger.info("Table 'users' exists but no version recorded. Stamping initial version...")
					command.stamp(alembic_cfg, "0001_initial")
					logger.info("Stamped version '0001_initial'")
	except Exception as e:
		logger.warning("Could not check/set initial version (this is OK for fresh database): %s", e)
	
	# Исправляем неправильную запись в alembic_version, если она существует
	try:
		from sqlalchemy import text
		with sync_engine.begin() as conn:
			result = conn.execute(
				text("UPDATE alembic_version_users SET version_num = '0002_add_rating_history' WHERE version_num = '0002_add_gin_indexes'")
			)
			if result.rowcount > 0:
				logger.info("Fixed incorrect alembic_version entry: '0002_add_gin_indexes' -> '0002_add_rating_history'")
	except Exception as e:
		logger.warning("Could not fix alembic_version (this is OK if the entry doesn't exist): %s", e)
	
	command.upgrade(alembic_cfg, "head")
	logger.info("Database migrations applied successfully")


@app.on_event("startup")
async def run_startup_tasks() -> None:
	logger.info("Users service startup initiated")
	# Migrations are now handled by the centralized migrations_service
	# Uncomment the following lines if you need to run migrations here:
	# try:
	# 	await asyncio.to_thread(apply_migrations)
	# 	logger.info("Users service startup completed")
	# except (SystemExit, Exception) as exc:
	# 	logger.exception("Error during startup tasks: %s", exc)
	# 	logger.error("Server will continue despite migration errors")
	logger.info("Users service startup completed")


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
app.include_router(internal_users_router)
app.include_router(ratings_router)
app.include_router(schools_router)


