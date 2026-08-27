# RESTful API — конвенции и аудит

> Документ описывает конвенции RESTful API в проекте и результаты аудита.

---

## 1. Принципы RESTful API

| Принцип | Описание |
|---------|----------|
| **Существительные** | URL — имена ресурсов (users, courses), не глаголы |
| **Множественное число** | Коллекции: `/users`, `/courses`, не `/user` |
| **HTTP-методы** | GET (чтение), POST (создание), PATCH/PUT (обновление), DELETE (удаление) |
| **Иерархия** | Вложенные ресурсы: `/courses/{id}/lessons` |
| **Порядок маршрутов** | Конкретные пути (`/me`, `/search`) до параметризованных (`/{id}`) |
| **Коды ответа** | 200, 201, 204, 400, 401, 403, 404, 409 |

---

## 2. Исправленные проблемы

### 2.1. Порядок маршрутов (критично)

**users_service** (`/api/users`):
- **Было:** `GET /search` и `GET /stats/aggregate` шли после `GET /{identifier}` → запрос `/search` обрабатывался как пользователь с username "search".
- **Исправлено:** Конкретные маршруты перенесены выше параметризованных.

**puzzles_service** (`/puzzles/stats`):
- **Было:** `GET /me/themes` шёл после `GET /{user_id}/themes` → для `/me/themes` возникала 422 (user_id="me" не int).
- **Исправлено:** `GET /me/themes` перенесён выше `GET /{user_id}/themes`.

### 2.2. Рекомендуемый порядок маршрутов

```
1. /me, /me/stats, /me/themes  — текущий пользователь
2. /search, /aggregate         — специальные операции
3. /stats/aggregate            — агрегаты
4. /{id}                       — ресурс по ID
5. /{id}/subresource           — вложенные ресурсы
```

---

## 3. Текущее соответствие RESTful

### 3.1. Соответствует

| Сервис | Endpoint | Комментарий |
|--------|----------|-------------|
| courses | `GET /`, `POST /`, `GET /{id}` | CRUD по ресурсу |
| lessons | `GET /`, `POST /`, `PATCH /{id}` | Вложено в courses |
| enrollments | `GET /me`, `POST /` | Коллекция |
| notifications | `GET /me`, `POST /`, `PATCH /{id}`, `DELETE /{id}` | CRUD |
| games | `GET /`, `POST /`, `GET /{id}`, `GET /{id}/moves` | Ресурсы |
| computer-games | Аналогично games | Ресурсы |

### 3.2. Допустимые отклонения (RPC-стиль)

| Endpoint | Причина |
|----------|---------|
| `POST /api/auth/register`, `/login` | Стандартная практика для аутентификации |
| `POST /api/auth/request-password-reset` | Сброс пароля — действие, не CRUD |
| `POST /api/payments/checkout/{course_id}` | Типичный паттерн для платежей |
| `POST /api/notifications/me/mark-all-read` | Массовое действие |

### 3.3. Возможные улучшения (низкий приоритет)

| Текущий | RESTful-вариант | Примечание |
|---------|------------------|------------|
| `POST /courses/{id}/enroll` | `POST /enrollments` с `{course_id}` в body | Уже есть `POST /enrollments` |
| `POST /games/{id}/join` | `POST /games/{id}/participants` | Текущий вариант привычен для игр |
| `POST /puzzles/daily/solve` | `POST /puzzles/daily/solutions` | Решение как создание записи |

---

## 4. Внутренние API

`/internal/*` — сервис-сервисные вызовы, не публичный REST. Допустимы:
- `GET /internal/users/by-login/{login}`
- `POST /internal/users`
- `POST /internal/enrollments`

---

## 5. Чеклист для новых эндпоинтов

- [ ] Имя ресурса во множественном числе
- [ ] Конкретные пути (`/me`, `/search`) объявлены до `/{id}`
- [ ] POST для создания возвращает 201
- [ ] DELETE возвращает 204
- [ ] Вложенные ресурсы: `/parent/{id}/child`
