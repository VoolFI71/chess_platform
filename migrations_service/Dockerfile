# syntax=docker/dockerfile:1.4
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

# Copy common package
COPY common ./common

# Copy all service directories (for alembic configs and migrations)
COPY users_service/alembic.ini ./users_service/alembic.ini
COPY users_service/alembic ./users_service/alembic
COPY auth_service/alembic.ini ./auth_service/alembic.ini
COPY auth_service/alembic ./auth_service/alembic
COPY courses_service/alembic.ini ./courses_service/alembic.ini
COPY courses_service/alembic ./courses_service/alembic
COPY lessons_service/alembic.ini ./lessons_service/alembic.ini
COPY lessons_service/alembic ./lessons_service/alembic
COPY enrollments_service/alembic.ini ./enrollments_service/alembic.ini
COPY enrollments_service/alembic ./enrollments_service/alembic
COPY payments_service/alembic.ini ./payments_service/alembic.ini
COPY payments_service/alembic ./payments_service/alembic
COPY games_service/alembic.ini ./games_service/alembic.ini
COPY games_service/alembic ./games_service/alembic
COPY notifications_service/alembic.ini ./notifications_service/alembic.ini
COPY notifications_service/alembic ./notifications_service/alembic
COPY puzzles_service/alembic.ini ./puzzles_service/alembic.ini
COPY puzzles_service/alembic ./puzzles_service/alembic

# Copy migrations service
COPY migrations_service ./migrations_service

# Install dependencies
RUN pip install --no-cache-dir alembic sqlalchemy psycopg2-binary

ENV PYTHONPATH=/app

# Run migrations
CMD ["python", "/app/migrations_service/main.py"]

