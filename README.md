Шахматная платформа с микросервисной архитектурой.

## 🏗️ Архитектура

Проект построен на микросервисной архитектуре с использованием:
- **Backend**: Python (FastAPI) и Go (Gin)
- **Frontend**: Vanilla JavaScript, HTML, CSS
- **База данных**: PostgreSQL
- **Очереди**: Kafka (для асинхронных задач)
- **Мониторинг**: Prometheus, Grafana, Loki
- **Контейнеризация**: Docker, Docker Compose

## 📦 Сервисы

### Python сервисы:
- **auth_service** - Аутентификация и авторизация (JWT)
- **users_service** - Управление пользователями, рейтингами, друзьями
- **courses_service** - Управление курсами
- **lessons_service** - Управление уроками и PGN файлами
- **enrollments_service** - Записи на курсы
- **payments_service** - Интеграция с YooKassa для платежей
- **puzzles_service** - Шахматные задачи и ежедневные пазлы
- **notifications_service** - WebSocket уведомления
- **backend** - API Gateway и статический фронтенд

### Go сервисы:
- **games_service_go** - Онлайн игры между пользователями
- **computer_games_service** - Игры против AI (Stockfish)
- **email_service_go** - Отправка email уведомлений

### Общие модули:
- **common** - Общие утилиты (конфигурация, БД, безопасность, логирование)


### Требования
- Docker и Docker Compose
- Python 3.12+ (для локальной разработки)
- Go 1.21+ (для локальной разработки Go сервисов)


## 📁 Структура проекта

```
.
├── auth_service/          # Сервис аутентификации
├── users_service/         # Сервис пользователей
├── courses_service/       # Сервис курсов
├── lessons_service/       # Сервис уроков
├── enrollments_service/   # Сервис записей
├── payments_service/      # Сервис платежей
├── puzzles_service/       # Сервис задач
├── notifications_service/ # Сервис уведомлений
├── backend/              # API Gateway + Frontend
│   ├── app/             # FastAPI приложение
│   └── web/             # Статический фронтенд
├── games_service_go/     # Онлайн игры (Go)
├── computer_games_service/ # Игры против AI (Go)
├── email_service_go/     # Email сервис (Go)
├── common/              # Общие модули
├── nginx/               # Nginx конфигурации
├── monitoring/          # Конфигурации мониторинга
└── docker-compose.yml   # Production конфигурация
```

## 📊 Мониторинг

- **Prometheus**: http://localhost:9090
- **Grafana**: http://localhost:3000 (admin/admin для локальной разработки)
- **Loki**: Логи через Grafana

## 🔒 Безопасность

- JWT токены для аутентификации
- Внутренние токены для межсервисной коммуникации
- Переменные окружения для секретов (не хранятся в коде)
- Валидация входных данных через Pydantic схемы
