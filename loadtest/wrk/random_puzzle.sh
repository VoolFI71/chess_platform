#!/usr/bin/env bash
# Нагрузка wrk на GET /api/puzzles/random (один URL — без Lua)
# Использование: ./loadtest/wrk/random_puzzle.sh
#
# Переменные:
#   BASE_URL      (по умолчанию https://chessmint.ru)
#   RATING_MIN    (по умолчанию 800)
#   RATING_MAX    (по умолчанию 2000)
#   THREADS       (по умолчанию 4)
#   CONNECTIONS   (по умолчанию 100)
#   DURATION      (по умолчанию 30s)

set -euo pipefail

BASE_URL="${BASE_URL:-https://chessmint.ru}"
RATING_MIN="${RATING_MIN:-800}"
RATING_MAX="${RATING_MAX:-2000}"
THREADS="${THREADS:-4}"
CONNECTIONS="${CONNECTIONS:-100}"
DURATION="${DURATION:-30s}"

BASE_URL="${BASE_URL%/}"
FULL_URL="${BASE_URL}/api/puzzles/random?rating_min=${RATING_MIN}&rating_max=${RATING_MAX}"

echo "URL: ${FULL_URL}"
echo "wrk -t${THREADS} -c${CONNECTIONS} -d${DURATION}"

exec wrk -t"${THREADS}" -c"${CONNECTIONS}" -d"${DURATION}" "${FULL_URL}"
