from __future__ import annotations

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from sqlalchemy import engine_from_config, pool

BASE_DIR = Path(__file__).resolve().parents[1]
if str(BASE_DIR) not in sys.path:
	sys.path.append(str(BASE_DIR))

# Импортируем Base напрямую из файла common/database.py, минуя common/__init__.py
# (который импортирует модули, требующие fastapi)
# Используем importlib для прямого импорта модуля без загрузки пакета
import importlib.util
common_db_path = BASE_DIR.parent / "common" / "database.py"
spec = importlib.util.spec_from_file_location("common_database", common_db_path)
common_database = importlib.util.module_from_spec(spec)
spec.loader.exec_module(common_database)
Base = common_database.Base

# Создаем mock модуль app.database с Base, чтобы модели могли его импортировать
# Это позволяет избежать импорта app.config и всех его зависимостей
import types
app_database_module = types.ModuleType("app.database")
app_database_module.Base = Base
sys.modules["app.database"] = app_database_module

# Импортируем модели, чтобы они зарегистрировались в Base.metadata
# Это нужно для того, чтобы Alembic знал о всех таблицах
try:
	from app.models import *  # noqa: F403, F401
except ImportError:
	# Если модели не найдены, это нормально - миграции все равно будут работать
	pass

config = context.config

if config.config_file_name:
	fileConfig(config.config_file_name)

target_metadata = Base.metadata


def get_url() -> str:
	# Для миграций используем DATABASE_URL из переменных окружения
	# Это позволяет избежать необходимости в jwt_secret и других полях Settings
	database_url = os.getenv("DATABASE_URL")
	if database_url:
		return database_url
	
	# Fallback: пытаемся использовать get_settings (для локальной разработки)
	try:
		from app.config import get_settings  # noqa: E402
		settings = get_settings()
		return settings.database_url
	except Exception:
		# Если не удалось загрузить настройки, используем значение по умолчанию
		return "postgresql://chess:chess@db:5432/chess"


def run_migrations_offline() -> None:
	context.configure(
		url=get_url(),
		target_metadata=target_metadata,
		literal_binds=True,
		dialect_opts={"paramstyle": "named"},
		compare_type=True,
		version_table="alembic_version_lessons",
	)

	with context.begin_transaction():
		context.run_migrations()


def run_migrations_online() -> None:
	connectable = engine_from_config(
		config.get_section(config.config_ini_section),
		prefix="sqlalchemy.",
		url=get_url(),
		poolclass=pool.NullPool,
	)

	with connectable.connect() as connection:
		context.configure(
			connection=connection,
			target_metadata=target_metadata,
			compare_type=True,
			version_table="alembic_version_lessons",
		)

		with context.begin_transaction():
			context.run_migrations()


if context.is_offline_mode():
	run_migrations_offline()
else:
	run_migrations_online()

