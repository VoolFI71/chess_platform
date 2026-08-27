# syntax=docker/dockerfile:1.4
FROM python:3.12-slim

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends build-essential libpq-dev && rm -rf /var/lib/apt/lists/*

# Copy common package
COPY common ./common

# Copy all service directories (for alembic configs, migrations, and app code)
COPY users_service ./users_service
COPY auth_service ./auth_service
COPY payments_service ./payments_service
COPY notifications_service ./notifications_service
COPY puzzles_service ./puzzles_service

# Copy migrations service
COPY migrations_service ./migrations_service

# Install only dependencies needed for migrations
# Мы импортируем Base напрямую из common.database, минуя app.config,
# поэтому нужны только базовые зависимости для работы с БД
RUN pip install --no-cache-dir \
    alembic==1.13.2 \
    sqlalchemy==2.0.36 \
    psycopg2-binary==2.9.9

ENV PYTHONPATH=/app

# Run migrations
CMD ["python", "/app/migrations_service/main.py"]

