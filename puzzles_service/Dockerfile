# syntax=docker/dockerfile:1.4
FROM python:3.12-slim AS base

ENV PYTHONDONTWRITEBYTECODE=1 \
	PYTHONUNBUFFERED=1

WORKDIR /app

RUN apt-get update && apt-get install -y --no-install-recommends \
	build-essential libpq-dev ca-certificates \
	&& rm -rf /var/lib/apt/lists/*

COPY puzzles_service/requirements.txt ./requirements.txt
# При обрывах SSL к pypi.org: повтори сборку или задай зеркало:
#   docker build --build-arg PIP_INDEX_URL=https://pypi.org/simple ...
ENV PIP_DEFAULT_TIMEOUT=120 \
	PIP_RETRIES=15

# Свежий pip реже ломается на TLS; --no-cache-dir меньше грузит диск при CI
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL}

RUN pip install --upgrade pip setuptools wheel \
	&& pip install --no-cache-dir --timeout=120 -r requirements.txt

COPY puzzles_service/alembic.ini ./alembic.ini
COPY puzzles_service/alembic ./alembic
COPY puzzles_service/app ./app
COPY common ./common

ENV PYTHONPATH=/app/app:/app

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]

