# Email Service (Go)

Микросервис для отправки email-уведомлений (приветственные письма, восстановление пароля) через SMTP.

## Структура проекта

```
email_service_go/
├── cmd/
│   └── server/
│       └── main.go              # Точка входа
├── internal/
│   ├── config/
│   │   └── config.go            # Конфигурация
│   ├── handlers/
│   │   ├── router.go            # HTTP роутер
│   │   ├── health.go            # Health check
│   │   ├── middleware.go        # Внутренняя авторизация
│   │   └── email.go             # Handlers для отправки email
│   ├── providers/
│   │   ├── provider.go          # Интерфейс EmailProvider
│   │   └── smtp_provider.go     # SMTP провайдер (Mail.ru, Gmail, etc.)
│   ├── services/
│   │   ├── email_service.go     # Бизнес-логика отправки
│   │   └── template_service.go  # Генерация HTML из шаблонов
│   └── templates/
│       ├── welcome.html         # Шаблон приветственного письма
│       └── password_reset.html  # Шаблон восстановления пароля
├── Dockerfile
├── go.mod
└── README.md
```

## Текущий статус

✅ Полностью реализован SMTP provider  
✅ Созданы HTML шаблоны писем  
✅ Реализована отправка приветственного письма  
✅ Реализована отправка письма восстановления пароля  
✅ Интеграция с Docker Compose  
✅ Настроен Nginx routing  

## Особенности

- **SMTP Provider**: Поддержка портов 465 (SSL/TLS) и 587 (STARTTLS)
- **HTML Templates**: Адаптивные шаблоны писем с поддержкой переменных
- **Mail.ru Support**: Оптимизировано для работы с Mail.ru SMTP
- **Docker Ready**: Готов к запуску через Docker Compose

## Запуск

### Локально (для разработки)

```bash
# Установить переменные окружения
export INTERNAL_TOKEN=your-token
export SMTP_HOST=smtp.mail.ru          # Для Mail.ru
export SMTP_PORT=465                   # или 587 для STARTTLS
export SMTP_USER=your-email@mail.ru
export SMTP_PASSWORD=your-app-password # Пароль приложения из настроек Mail.ru
export SMTP_FROM_EMAIL=your-email@mail.ru
export SMTP_FROM_NAME="ChessMint"
export FRONTEND_URL=http://localhost:8080
export PORT=8000

# Запустить
go run ./cmd/server
```

### Настройка Mail.ru

1. Зайдите в настройки почты Mail.ru
2. Включите "Пароли для внешних приложений"
3. Создайте пароль для приложения
4. Используйте этот пароль в `SMTP_PASSWORD`
5. Настройки SMTP:
   - **Host**: `smtp.mail.ru`
   - **Port**: `465` (SSL) или `587` (STARTTLS)
   - **User**: ваш email (например, `user@mail.ru`)
   - **Password**: пароль приложения

### Сборка

```bash
go build ./cmd/server
./server
```

## API эндпоинты

### Health Check
```http
GET /health
```

### Отправка приветственного письма
```http
POST /api/emails/send-welcome
Authorization: Bearer <INTERNAL_TOKEN>
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "Username",
  "verification_token": "uuid"  // опционально
}
```

### Отправка письма восстановления пароля
```http
POST /api/emails/send-password-reset
Authorization: Bearer <INTERNAL_TOKEN>
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "Username",
  "reset_token": "uuid",
  "expires_at": "2024-01-01T13:00:00Z"
}
```

### Отправка письма с кодом верификации (6-значный код)
```http
POST /api/emails/send-verification-code
Authorization: Bearer <INTERNAL_TOKEN>
Content-Type: application/json

{
  "email": "user@example.com",
  "username": "Username",
  "code": "123456",
  "purpose": "Для подтверждения email используйте следующий код:",
  "expires_in_minutes": 10
}
```

**Параметры:**
- `code` - 6-значный код (обязательно, только цифры)
- `purpose` - назначение кода (опционально)
- `expires_in_minutes` - время действия кода в минутах (1-60)

## Интеграция с auth_service

Для отправки приветственного письма при регистрации добавьте в `auth_service/app/routers/auth.py`:

```python
@router.post("/register", response_model=UserOut, status_code=status.HTTP_201_CREATED)
async def register(user_in: UserCreate) -> UserOut:
    email = user_in.email.lower()
    username = _sanitize_username(getattr(user_in, "username", None), email)
    hashed_password = get_password_hash(user_in.password)
    
    # Создаём пользователя
    user = await create_user(username=username, email=email, hashed_password=hashed_password)
    
    # Отправляем приветственное письмо (не блокируем регистрацию при ошибке)
    try:
        email_client = await get_email_client()  # HTTP клиент для email сервиса
        await email_client.post(
            "/api/emails/send-welcome",
            json={
                "email": email,
                "username": username,
            },
            headers={"Authorization": f"Bearer {INTERNAL_TOKEN}"},
            timeout=5.0
        )
    except Exception as e:
        logger.warning(f"Failed to send welcome email: {e}")
        # Регистрация успешна, даже если письмо не отправилось
    
    return user
```

## Переменные окружения

### Обязательные
- `INTERNAL_TOKEN` - токен для внутренней авторизации между сервисами
- `SMTP_HOST` - адрес SMTP сервера (например, `smtp.mail.ru`)
- `SMTP_USER` - имя пользователя SMTP
- `SMTP_PASSWORD` - пароль SMTP

### Опциональные
- `PORT` - порт сервера (по умолчанию: `8000`)
- `SMTP_PORT` - порт SMTP (по умолчанию: `587`)
- `SMTP_FROM_EMAIL` - email отправителя (по умолчанию: `noreply@chessmint.ru`)
- `SMTP_FROM_NAME` - имя отправителя (по умолчанию: `ChessMint`)
- `EMAIL_PROVIDER` - провайдер email (по умолчанию: `smtp`)
- `FRONTEND_URL` - URL фронтенда для ссылок в письмах (по умолчанию: `http://localhost:8080`)
- `FRONTEND_RESET_PASSWORD_PATH` - путь к странице восстановления пароля (по умолчанию: `/reset-password`)

## Docker

Сервис уже настроен в `docker-compose.local.yml` и `docker-compose.yml`.

Запуск:
```bash
docker-compose -f docker-compose.local.yml up email
```

## Примеры использования

### Отправка приветственного письма

```bash
curl -X POST http://localhost:8080/api/emails/send-welcome \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "Username",
    "verification_token": "optional-uuid-token"
  }'
```

### Отправка письма восстановления пароля

```bash
curl -X POST http://localhost:8080/api/emails/send-password-reset \
  -H "Authorization: Bearer YOUR_INTERNAL_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "email": "user@example.com",
    "username": "Username",
    "reset_token": "uuid-token",
    "expires_at": "2024-12-07T12:00:00Z"
  }'
```

## Полная документация

См. полный план в `docs/EMAIL_SERVICE_GOLANG_PLAN.md`

