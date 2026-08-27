/**
 * Один виртуальный пользователь, 1 итерация — быстрая проверка доступности.
 * k6 run loadtest/k6/smoke.js
 */
import http from 'k6/http';
import { check } from 'k6';

const base = __ENV.BASE_URL || 'https://chessmint.ru';
const ratingMin = __ENV.RATING_MIN || '800';
const ratingMax = __ENV.RATING_MAX || '2000';

export const options = {
  vus: 1,
  iterations: 1,
};

export default function () {
  const url = `${base.replace(/\/$/, '')}/api/puzzles/random?rating_min=${ratingMin}&rating_max=${ratingMax}`;
  const res = http.get(url);
  check(res, {
    'status 200': (r) => r.status === 200,
  });
}
