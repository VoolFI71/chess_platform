# План микросервиса отправки email на Golang

## 📋 Обзор

Микросервис для отправки email-уведомлений при регистрации и восстановлении пароля.

**Назначение:**
- Отправка приветственного письма при регистрации
- Отправка письма с токеном для восстановления пароля
- Поддержка различных SMTP провайдеров (SMTP, SendGrid, AWS SES)
- Асинхронная отправка через очередь сообщений

---

## 🏗️ Архитектура

### Структура проекта
```
email_service_go/
├── cmd/
│   └── server/
│       └── main.go              # Точка входа
├── internal/
│   ├── config/
│   │   └── config.go            # Конфигурация (SMTP, провайдеры)
│   ├── database/
│   │   └── db.go                # Подключение к БД (для логирования)
│   ├── handlers/
│   │   ├── router.go            # HTTP роутер (Gin)
│   │   ├── email.go             # HTTP handlers
│   │   └── health.go            # Health check
│   ├── models/
│   │   └── email.go             # Модели (EmailLog, EmailQueue)
│   ├── services/
│   │   ├── email_service.go     # Бизнес-логика отправки
│   │   └── template_service.go  # Генерация HTML шаблонов
│   ├── providers/
│   │   ├── provider.go          # Интерфейс EmailProvider
│   │   ├── smtp_provider.go     # SMTP провайдер
│   │   ├── sendgrid_provider.go # SendGrid провайдер (опционально)
│   │   └── ses_provider.go      # AWS SES провайдер (опционально)
│   └── templates/
│       ├── welcome.html         # Шаблон приветственного письма
│       ├── password_reset.html  # Шаблон восстановления пароля
│       └── base.html            # Базовый шаблон
├── Dockerfile
├── go.mod
├── go.sum
└── README.md
```

---

## 📦 Технологии и зависимости

### Основные библиотеки
- **Gin** (`github.com/gin-gonic/gin`) - HTTP фреймворк
- **GORM** (`gorm.io/gorm`) - ORM для логирования отправок
- **PostgreSQL Driver** (`gorm.io/driver/postgres`) - драйвер БД
- **Email** (`github.com/go-mail/mail`) или `net/smtp` - отправка email
- **HTML Templates** (`html/template`) - шаблоны писем
- **UUID** (`github.com/google/uuid`) - генерация токенов

### Опциональные зависимости
- **SendGrid SDK** (`github.com/sendgrid/sendgrid-go`) - для SendGrid
- **AWS SDK** (`github.com/aws/aws-sdk-go`) - для AWS SES

---

## 🔧 Конфигурация

### Переменные окружения
```env
# Server
PORT=8000

# Database (для логирования отправок)
DATABASE_URL=postgresql://chess:chess@db:5432/chess

# Internal Auth
INTERNAL_TOKEN=your-internal-token

# SMTP Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASSWORD=your-app-password
SMTP_FROM_EMAIL=noreply@chessmint.ru
SMTP_FROM_NAME=ChessMint

# Email Provider (smtp, sendgrid, ses)
EMAIL_PROVIDER=smtp

# SendGrid (опционально)
SENDGRID_API_KEY=your-sendgrid-api-key

# AWS SES (опционально)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your-access-key
AWS_SECRET_ACCESS_KEY=your-secret-key

# Frontend URLs (для ссылок в письмах)
FRONTEND_URL=http://localhost:8080
FRONTEND_RESET_PASSWORD_PATH=/reset-password

# Logging
METRICS_ENABLED=true
```

---

## 📡 API Эндпоинты

### 1. Отправка приветственного письма
```http
POST /api/emails/send-welcome
Authorization: Bearer <internal-token>
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "Username",
  "verification_token": "uuid-token"  // опционально для верификации email
}
```

**Ответ:**
```json
{
  "message_id": "uuid",
  "status": "sent",
  "sent_at": "2024-01-01T12:00:00Z"
}
```

### 2. Отправка письма для восстановления пароля
```http
POST /api/emails/send-password-reset
Authorization: Bearer <internal-token>
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "Username",
  "reset_token": "uuid-token",
  "expires_at": "2024-01-01T13:00:00Z"
}
```

**Ответ:**
```json
{
  "message_id": "uuid",
  "status": "sent",
  "sent_at": "2024-01-01T12:00:00Z"
}
```

### 3. Health Check
```http
GET /health
```

**Ответ:**
```json
{
  "status": "ok",
  "database": "connected",
  "smtp": "configured"
}
```

### 4. Статус отправки (для отладки)
```http
GET /api/emails/{message_id}
Authorization: Bearer <internal-token>
```

---

## 🎨 Email Шаблоны

### 1. Приветственное письмо (`welcome.html`)
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Добро пожаловать в ChessMint!</title>
</head>
<body>
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Добро пожаловать, {{.Username}}!</h1>
        <p>Спасибо за регистрацию в ChessMint.</p>
        <p>Ваш аккаунт успешно создан. Начните решать задачи, играть партии и улучшать свои навыки!</p>
        {{if .VerificationToken}}
        <p>
            <a href="{{.FrontendURL}}/verify-email?token={{.VerificationToken}}">
                Подтвердить email
            </a>
        </p>
        {{end}}
        <hr>
        <p style="color: #666; font-size: 12px;">
            Если вы не регистрировались на ChessMint, просто проигнорируйте это письмо.
        </p>
    </div>
</body>
</html>
```

### 2. Восстановление пароля (`password_reset.html`)
```html
<!DOCTYPE html>
<html>
<head>
    <meta charset="UTF-8">
    <title>Восстановление пароля</title>
</head>
<body>
    <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Восстановление пароля</h1>
        <p>Здравствуйте, {{.Username}}!</p>
        <p>Вы запросили восстановление пароля для вашего аккаунта ChessMint.</p>
        <p>
            <a href="{{.FrontendURL}}{{.ResetPasswordPath}}?token={{.ResetToken}}">
                Восстановить пароль
            </a>
        </p>
        <p style="color: #666;">
            Ссылка действительна до {{.ExpiresAt}}.
        </p>
        <p style="color: #999; font-size: 12px;">
            Если вы не запрашивали восстановление пароля, проигнорируйте это письмо.
        </p>
    </div>
</body>
</html>
```

---

## 🔌 Интерфейс EmailProvider

```go
type EmailProvider interface {
    SendEmail(ctx context.Context, to, subject, bodyHTML, bodyText string) error
    Validate() error // Проверка конфигурации
}
```

### Реализации:
1. **SMTP Provider** - стандартный SMTP (Gmail, Mail.ru, Яндекс.Почта)
2. **SendGrid Provider** (опционально)
3. **AWS SES Provider** (опционально)

---

## 📊 Модели данных (для логирования)

### EmailLog
```go
type EmailLog struct {
    ID              uuid.UUID `gorm:"type:uuid;primary_key"`
    To              string    `gorm:"not null"`
    Subject         string    `gorm:"not null"`
    Type            string    `gorm:"not null"` // "welcome", "password_reset"
    Status          string    `gorm:"not null"` // "sent", "failed", "pending"
    Provider        string    `gorm:"not null"` // "smtp", "sendgrid", "ses"
    ErrorMessage    string    `gorm:"type:text"`
    SentAt          *time.Time
    CreatedAt       time.Time
    UpdatedAt       time.Time
}
```

---

## 🔄 Интеграция с auth_service

### Изменения в `auth_service`:

1. **После регистрации** (`auth_service/app/routers/auth.py`):
```python
@router.post("/register", ...)
async def register(user_in: UserCreate):
    # ... создание пользователя ...
    
    # Отправка приветственного письма
    try:
        email_client = await get_email_client()
        await email_client.post(
            "/api/emails/send-welcome",
            json={
                "email": email,
                "username": username,
            },
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"}
        )
    except Exception as e:
        logger.warning(f"Failed to send welcome email: {e}")
        # Не блокируем регистрацию при ошибке отправки email
    
    return user_out
```

2. **Восстановление пароля** (новый эндпоинт):
```python
@router.post("/password-reset-request", ...)
async def request_password_reset(email_in: EmailInput):
    # Генерация токена восстановления
    reset_token = generate_reset_token()
    expires_at = datetime.utcnow() + timedelta(hours=1)
    
    # Сохранение токена в БД
    # ...
    
    # Отправка email
    await email_client.post(
        "/api/emails/send-password-reset",
        json={
            "email": email_in.email,
            "username": user.username,
            "reset_token": reset_token,
            "expires_at": expires_at.isoformat(),
        },
        headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"}
    )
```

---

## 🐳 Docker Configuration

### Dockerfile
```dockerfile
# Multi-stage build
FROM golang:1.21-alpine AS builder

WORKDIR /app

COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -a -installsuffix cgo -o /app/server ./cmd/server

FROM alpine:latest
RUN apk --no-cache add ca-certificates

WORKDIR /root/
COPY --from=builder /app/server .
COPY --from=builder /app/internal/templates ./templates

EXPOSE 8000
CMD ["./server"]
```

### docker-compose.yml
```yaml
email:
  build:
    context: ./email_service_go
    dockerfile: Dockerfile
  depends_on:
    db:
      condition: service_started
  environment:
    PORT: 8000
    DATABASE_URL: postgresql://chess:chess@db:5432/chess
    INTERNAL_TOKEN: ${INTERNAL_TOKEN}
    SMTP_HOST: ${SMTP_HOST}
    SMTP_PORT: ${SMTP_PORT}
    SMTP_USER: ${SMTP_USER}
    SMTP_PASSWORD: ${SMTP_PASSWORD}
    SMTP_FROM_EMAIL: noreply@chessmint.ru
    SMTP_FROM_NAME: ChessMint
    EMAIL_PROVIDER: smtp
    FRONTEND_URL: http://localhost:8080
    FRONTEND_RESET_PASSWORD_PATH: /reset-password
    METRICS_ENABLED: "true"
  restart: unless-stopped
```

---

## 🔀 Nginx Configuration

### Добавить в `nginx/gateway.dev.conf` и `nginx/gateway.prod.conf`:
```nginx
# Email service -> email service
location /api/emails/ {
    proxy_pass http://email:8000;
    proxy_http_version 1.1;
    proxy_set_header Host $host;
    proxy_set_header X-Real-IP $remote_addr;
    proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    proxy_set_header X-Forwarded-Proto $scheme;
    proxy_set_header Connection "";
}
```

---

## ✅ Чек-лист реализации

### Фаза 1: Базовая структура
- [ ] Создать структуру проекта `email_service_go/`
- [ ] Настроить `go.mod` с зависимостями
- [ ] Реализовать `config/config.go` для загрузки настроек
- [ ] Создать `cmd/server/main.go` с базовым сервером
- [ ] Добавить `handlers/router.go` с Gin роутером

### Фаза 2: SMTP Provider
- [ ] Реализовать интерфейс `EmailProvider`
- [ ] Реализовать `smtp_provider.go` с использованием `net/smtp` или `github.com/go-mail/mail`
- [ ] Добавить валидацию SMTP конфигурации

### Фаза 3: Шаблоны и сервис
- [ ] Создать HTML шаблоны (`welcome.html`, `password_reset.html`)
- [ ] Реализовать `template_service.go` для генерации писем
- [ ] Реализовать `email_service.go` с бизнес-логикой

### Фаза 4: HTTP Handlers
- [ ] Реализовать `POST /api/emails/send-welcome`
- [ ] Реализовать `POST /api/emails/send-password-reset`
- [ ] Добавить внутреннюю авторизацию через `INTERNAL_TOKEN`
- [ ] Реализовать `GET /health`

### Фаза 5: Логирование (опционально)
- [ ] Создать модель `EmailLog` в GORM
- [ ] Сохранять логи отправок в БД
- [ ] Реализовать `GET /api/emails/{message_id}`

### Фаза 6: Docker и интеграция
- [ ] Создать `Dockerfile`
- [ ] Добавить сервис в `docker-compose.local.yml` и `docker-compose.yml`
- [ ] Добавить nginx конфигурацию
- [ ] Обновить `auth_service` для вызова email сервиса

### Фаза 7: Тестирование
- [ ] Протестировать отправку приветственного письма
- [ ] Протестировать отправку письма восстановления пароля
- [ ] Протестировать обработку ошибок (неверный SMTP, недоступный сервер)
- [ ] Протестировать валидацию токена внутренней авторизации

---

## 🔒 Безопасность

1. **Внутренняя авторизация**: Все эндпоинты требуют `INTERNAL_TOKEN`
2. **Валидация email**: Проверка формата email перед отправкой
3. **Rate Limiting**: Ограничение количества отправок с одного IP/email
4. **Токены**: Использование безопасных UUID для reset токенов
5. **Таймауты**: Установка таймаутов для SMTP соединений

---

## 📈 Метрики и мониторинг

1. **Prometheus метрики**:
   - `email_sent_total` - количество отправленных писем
   - `email_failed_total` - количество ошибок отправки
   - `email_duration_seconds` - время отправки

2. **Логирование**:
   - Успешные отправки
   - Ошибки SMTP
   - Невалидные запросы

---

## 🚀 Дополнительные улучшения (будущее)

1. **Очередь сообщений**: Использование Redis/RabbitMQ для асинхронной отправки
2. **Retry механизм**: Повторная отправка при временных ошибках
3. **Множественные провайдеры**: Fallback на другой провайдер при ошибке
4. **Email верификация**: Полноценная система подтверждения email
5. **Шаблоны**: Поддержка нескольких языков (i18n)
6. **Аналитика**: Отслеживание открытий и кликов (pixel tracking)

---

## 📝 Примечания

- Микросервис должен быть **независимым** от других сервисов (кроме БД для логирования)
- Отправка email **не должна блокировать** регистрацию/восстановление пароля
- Поддержка как plain text, так и HTML писем
- В production использовать надежные SMTP провайдеры (SendGrid, AWS SES, Mailgun)

