#!/usr/bin/env python3
"""Centralized migration service for all microservices."""

import logging
import os
import time
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://chess:chess@db:5432/chess")
BASE_DIR = Path(__file__).parent.parent

MIGRATION_ORDER = [
    ("users", "users_service", "alembic_version_users"),
    ("auth", "auth_service", "alembic_version_auth"),
    ("payments", "payments_service", "alembic_version_payments"),
    ("notifications", "notifications_service", "alembic_version_notifications"),
    ("puzzles", "puzzles_service", "alembic_version_puzzles"),
]

SERVICE_TABLES = {
    "users": ["users", "rating_history", "schools"],
    "auth": ["refresh_tokens"],
    "payments": ["orders"],
    "notifications": ["notifications"],
    "puzzles": ["puzzles", "puzzle_user_stats", "puzzle_attempts"],
}

GAMES_MIGRATION_VERSION_TABLE = "schema_migrations_games"
GAMES_MIGRATIONS = (
    ("0001_games", "0001_games.sql"),
    ("0002_games_performance", "0002_games_performance.sql"),
)


def wait_for_database(timeout: float = 60.0, retry_interval: float = 2.0) -> None:
    """Wait until PostgreSQL accepts connections."""
    deadline = time.time() + timeout
    engine = create_engine(DATABASE_URL)
    last_error: Exception | None = None

    while time.time() < deadline:
        try:
            with engine.begin() as conn:
                conn.execute(text("SELECT 1"))
            if last_error:
                logger.info("Database connection restored after: %s", last_error)
            return
        except OperationalError as exc:
            last_error = exc
            logger.warning(
                "Database not ready yet (retrying in %.1fs): %s", retry_interval, exc
            )
            time.sleep(retry_interval)

    logger.error("Database is not reachable after %.1fs", timeout)
    raise RuntimeError("Database is not reachable") from last_error


def check_and_stamp_initial_version(
    service_name: str, version_table: str, tables: list[str], engine
) -> None:
    """Stamp an existing unversioned schema so Alembic can continue from it."""
    try:
        inspector = inspect(engine)
        any_table_exists = any(inspector.has_table(table) for table in tables)
        if not any_table_exists:
            return

        with engine.begin() as conn:
            if not inspector.has_table(version_table):
                conn.execute(
                    text(f"""
                        CREATE TABLE IF NOT EXISTS {version_table} (
                            version_num VARCHAR(32) NOT NULL PRIMARY KEY
                        )
                    """)
                )
                logger.info("Created version table: %s", version_table)

            count = conn.execute(text(f"SELECT COUNT(*) FROM {version_table}")).scalar()
            if count == 0:
                logger.info(
                    "Tables for '%s' exist but no version is recorded; stamping initial version",
                    service_name,
                )
                conn.execute(
                    text(f"INSERT INTO {version_table} (version_num) VALUES ('0001_initial')")
                )
    except Exception as exc:
        logger.warning(
            "Could not check/set initial version for %s (fresh database may be expected): %s",
            service_name,
            exc,
        )


def apply_service_migrations(service_name: str, service_dir: str, version_table: str) -> None:
    """Apply Alembic migrations for one service."""
    service_path = BASE_DIR / service_dir
    alembic_ini = service_path / "alembic.ini"
    alembic_versions = service_path / "alembic" / "versions"

    if not alembic_ini.exists():
        raise FileNotFoundError(f"Alembic config not found for {service_name}: {alembic_ini}")
    if not alembic_versions.exists():
        raise FileNotFoundError(
            f"Migration directory not found for {service_name}: {alembic_versions}"
        )

    logger.info("Applying migrations for %s...", service_name)
    alembic_cfg = AlembicConfig(str(alembic_ini))
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    alembic_cfg.set_main_option("version_table", version_table)
    command.upgrade(alembic_cfg, "head")
    logger.info("Migrations for %s applied successfully", service_name)


def apply_games_migrations(engine) -> None:
    """Apply the shared SQL schema used by both Go game services."""
    with engine.begin() as conn:
        conn.execute(
            text(f"""
                CREATE TABLE IF NOT EXISTS {GAMES_MIGRATION_VERSION_TABLE} (
                    version_num VARCHAR(32) PRIMARY KEY,
                    applied_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
                )
            """)
        )
        for version, filename in GAMES_MIGRATIONS:
            migration_path = BASE_DIR / "migrations_service" / "sql" / filename
            if not migration_path.exists():
                raise FileNotFoundError(f"Games migration not found: {migration_path}")

            already_applied = conn.execute(
                text(
                    f"SELECT 1 FROM {GAMES_MIGRATION_VERSION_TABLE} "
                    "WHERE version_num = :version"
                ),
                {"version": version},
            ).first()
            if already_applied:
                continue

            logger.info("Applying games migration %s...", version)
            conn.exec_driver_sql(migration_path.read_text(encoding="utf-8"))
            conn.execute(
                text(
                    f"INSERT INTO {GAMES_MIGRATION_VERSION_TABLE} (version_num) "
                    "VALUES (:version)"
                ),
                {"version": version},
            )
    logger.info("Games migrations are up to date")


def main() -> None:
    logger.info("Starting centralized migration service...")
    wait_for_database()
    engine = create_engine(DATABASE_URL)

    for service_name, service_dir, version_table in MIGRATION_ORDER:
        tables = SERVICE_TABLES.get(service_name, [])
        if tables:
            check_and_stamp_initial_version(service_name, version_table, tables, engine)
        # Fail fast: later services may depend on a schema that failed to migrate.
        apply_service_migrations(service_name, service_dir, version_table)

    apply_games_migrations(engine)
    logger.info("All migrations completed successfully!")


if __name__ == "__main__":
    main()
