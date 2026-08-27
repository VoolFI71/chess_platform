/**
 * Нагрузка на GET /api/puzzles/random
 * Запуск: k6 run loadtest/k6/puzzles-random.js
 *
 * Переменные окружения:
 *   BASE_URL    — по умолчанию https://chessmint.ru
 *   RATING_MIN  — по умолчанию 800
 *   RATING_MAX  — по умолчанию 2000
 */
import http from 'k6/http';
import { check, sleep } from 'k6';

const base = __ENV.BASE_URL || 'https://chessmint.ru';
const ratingMin = __ENV.RATING_MIN || '800';
const ratingMax = __ENV.RATING_MAX || '2000';

const url = `${base.replace(/\/$/, '')}/api/puzzles/random?rating_min=${ratingMin}&rating_max=${ratingMax}`;

export const options = {
  stages: [
    { duration: '30s', target: 10 },
    { duration: '1m', target: 40 },
    { duration: '30s', target: 0 },
  ],
  thresholds: {
    http_req_failed: ['rate<0.05'],
    http_req_duration: ['p(95)<800'],
  },
};

export function setup() {
  const res = http.get(url);
  if (res.status !== 200) {
    throw new Error(
      `Прогрев/setup не прошёл: HTTP ${res.status} — проверьте данные в БД (puzzles) и фильтры rating. URL: ${url}`
    );
  }
  return { url };
}

export default function (data) {
  const res = http.get(data.url);
  check(res, {
    'status 200': (r) => r.status === 200,
  });
  sleep(0.05);
}
