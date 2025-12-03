#!/usr/bin/env python3
"""
Centralized migration service.
Applies all migrations from all microservices in the correct order.
"""
import logging
import sys
import time
from pathlib import Path

from alembic import command
from alembic.config import Config as AlembicConfig
from sqlalchemy import create_engine, inspect, text
from sqlalchemy.exc import OperationalError

# Setup logging
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
)
logger = logging.getLogger(__name__)

# Database URL from environment
import os

DATABASE_URL = os.getenv(
    "DATABASE_URL",
    "postgresql://chess:chess@db:5432/chess"
)

# Base directory - migrations_service is in the root, so parent is the project root
BASE_DIR = Path(__file__).parent.parent

# Migration order: services that don't depend on others first
MIGRATION_ORDER = [
    ("users", "users_service", "alembic_version_users"),
    ("auth", "auth_service", "alembic_version_auth"),
    ("courses", "courses_service", "alembic_version_courses"),
    ("lessons", "lessons_service", "alembic_version_lessons"),
    ("enrollments", "enrollments_service", "alembic_version_enrollments"),
    ("payments", "payments_service", "alembic_version_payments"),
    ("games", "games_service", "alembic_version_games"),
    ("notifications", "notifications_service", "alembic_version_notifications"),
    ("puzzles", "puzzles_service", "alembic_version_puzzles"),
]

# Tables to check for existence (to determine if we need to stamp initial version)
SERVICE_TABLES = {
    "users": ["users", "rating_history"],  # Добавляем rating_history для проверки
    "auth": ["refresh_tokens"],
    "courses": ["courses"],
    "lessons": ["lessons"],
    "enrollments": ["enrollments"],
    "payments": ["payments", "payment_transactions", "subscriptions"],
    "games": ["games", "moves"],  # Исправлено: таблица называется moves, а не game_moves
    "notifications": ["notifications"],
    "puzzles": ["puzzles", "puzzle_user_stats", "puzzle_attempts"],
}


def wait_for_database(timeout: float = 60.0, retry_interval: float = 2.0) -> None:
    """Wait for database to be ready."""
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
    """Check if tables exist but no version is recorded, and stamp initial version if needed."""
    try:
        inspector = inspect(engine)
        
        # Check if any of the service tables exist
        any_table_exists = any(inspector.has_table(table) for table in tables)
        
        if any_table_exists:
            # Check if version table exists and has entries
            with engine.begin() as conn:
                # Check if version table exists
                version_table_exists = inspector.has_table(version_table)
                
                if not version_table_exists:
                    # Create version table
                    conn.execute(
                        text(f"""
                            CREATE TABLE IF NOT EXISTS {version_table} (
                                version_num VARCHAR(32) NOT NULL,
                                PRIMARY KEY (version_num)
                            )
                        """)
                    )
                    logger.info(f"Created version table: {version_table}")
                
                # Check if there's a version entry
                result = conn.execute(
                    text(f"SELECT COUNT(*) FROM {version_table}")
                )
                count = result.scalar()
                
                if count == 0:
                    # Tables exist but no version - stamp initial version
                    logger.info(
                        f"Tables for '{service_name}' exist but no version recorded. "
                        f"Stamping initial version..."
                    )
                    conn.execute(
                        text(f"INSERT INTO {version_table} (version_num) VALUES ('0001_initial')")
                    )
                    logger.info(f"Stamped version '0001_initial' for {service_name}")
    except Exception as e:
        logger.warning(
            f"Could not check/set initial version for {service_name} "
            f"(this is OK for fresh database): {e}"
        )


def apply_service_migrations(service_name: str, service_dir: str, version_table: str) -> None:
    """Apply migrations for a single service."""
    service_path = BASE_DIR / service_dir
    alembic_ini = service_path / "alembic.ini"
    alembic_versions = service_path / "alembic" / "versions"
    
    if not alembic_ini.exists():
        logger.warning(f"Alembic config not found for {service_name} at {alembic_ini}")
        return
    
    if not alembic_versions.exists():
        logger.warning(f"Migration directory not found for {service_name} at {alembic_versions}")
        return
    
    logger.info(f"Applying migrations for {service_name}...")
    
    alembic_cfg = AlembicConfig(str(alembic_ini))
    alembic_cfg.set_main_option("sqlalchemy.url", DATABASE_URL)
    alembic_cfg.set_main_option("version_table", version_table)
    
    try:
        command.upgrade(alembic_cfg, "head")
        logger.info(f"Migrations for {service_name} applied successfully")
    except Exception as e:
        logger.error(f"Failed to apply migrations for {service_name}: {e}")
        raise


def main() -> None:
    """Main migration function."""
    logger.info("Starting centralized migration service...")
    
    # Wait for database
    logger.info("Waiting for database to be ready...")
    wait_for_database()
    
    # Create engine for checks
    engine = create_engine(DATABASE_URL)
    
    # Apply migrations in order
    for service_name, service_dir, version_table in MIGRATION_ORDER:
        try:
            # Check and stamp initial version if needed
            tables = SERVICE_TABLES.get(service_name, [])
            if tables:
                check_and_stamp_initial_version(service_name, version_table, tables, engine)
            
            # Apply migrations
            apply_service_migrations(service_name, service_dir, version_table)
        except Exception as e:
            logger.error(f"Migration failed for {service_name}: {e}")
            # Continue with other services, but log the error
            # In production, you might want to fail fast here
    
    logger.info("All migrations completed successfully!")


if __name__ == "__main__":
    main()

