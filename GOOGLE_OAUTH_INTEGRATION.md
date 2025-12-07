# Интеграция Google OAuth 2.0

## Методы OAuth 2.0 для Google

### 1. **Authorization Code Flow** (Рекомендуется) ✅
**Лучший выбор для веб-приложений**

**Процесс:**
1. Пользователь нажимает "Войти через Google"
2. Приложение перенаправляет на Google с `client_id` и `redirect_uri`
3. Пользователь авторизуется в Google
4. Google перенаправляет обратно с `authorization_code`
5. Сервер обменивает `code` на `access_token` (используя `client_secret`)
6. Сервер получает данные пользователя из Google API
7. Создается/находится пользователь в БД
8. Выдаются JWT токены (access + refresh)

**Преимущества:**
- ✅ Безопасно (токены не передаются через браузер)
- ✅ Поддерживает refresh tokens
- ✅ Стандартный и надежный метод

**Недостатки:**
- Требует серверную часть для обмена кода на токен

---

### 2. **Implicit Flow** (Устарел) ❌
**Не рекомендуется Google с 2022 года**

**Процесс:**
- Токен возвращается напрямую в URL фрагменте (#access_token=...)
- Не требует серверной части для обмена

**Недостатки:**
- ❌ Менее безопасно
- ❌ Нет refresh tokens
- ❌ Устарел, Google не рекомендует

---

### 3. **Client Credentials Flow**
**Только для сервер-сервер взаимодействия**

**Использование:**
- API к API без участия пользователя
- Не подходит для аутентификации пользователей

---

### 4. **Device Flow**
**Для устройств без браузера**

**Использование:**
- Smart TV, IoT устройства
- Не подходит для веб-приложений

---

## Рекомендуемое решение для вашего проекта

### Использовать: **Authorization Code Flow**

## План реализации

### Этап 1: Настройка Google Cloud Console

1. Перейти в [Google Cloud Console](https://console.cloud.google.com/)
2. Создать новый проект или выбрать существующий
3. Включить **Google+ API** (или **Google Identity Services API**)
4. Перейти в **Credentials** → **Create Credentials** → **OAuth 2.0 Client ID**
5. Настроить:
   - **Application type**: Web application
   - **Name**: PowerChess Auth
   - **Authorized JavaScript origins**: 
     - `http://localhost:8080` (для dev)
     - `https://power-chess.ru` (для prod)
   - **Authorized redirect URIs**:
     - `http://localhost:8080/api/auth/google/callback` (для dev)
     - `https://power-chess.ru/api/auth/google/callback` (для prod)
6. Сохранить **Client ID** и **Client Secret**

---

### Этап 2: Backend - Добавление зависимостей

**Файл: `auth_service/requirements.txt`**
```txt
# Добавить:
google-auth==2.23.4
google-auth-oauthlib==1.1.0
google-auth-httplib2==0.1.1
```

---

### Этап 3: Backend - Конфигурация

**Файл: `auth_service/app/config.py`**
```python
class Settings(BaseServiceSettings):
    # ... существующие настройки ...
    
    # Google OAuth
    google_client_id: str | None = None
    google_client_secret: str | None = None
    google_redirect_uri: str | None = None  # Будет формироваться автоматически
```

**Файл: `.env`**
```env
GOOGLE_CLIENT_ID=your_client_id_here
GOOGLE_CLIENT_SECRET=your_client_secret_here
```

---

### Этап 4: Backend - Создание OAuth роутера

**Новый файл: `auth_service/app/routers/oauth.py`**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from fastapi.responses import RedirectResponse
from sqlalchemy.ext.asyncio import AsyncSession
import httpx
from urllib.parse import urlencode

from ..database import get_db
from ..config import get_settings
from ..security import create_access_token, create_refresh_token
from ..services.users_api import create_user, fetch_user_by_login

router = APIRouter(prefix="/api/auth/google", tags=["oauth"])

GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth"
GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token"
GOOGLE_USERINFO_URL = "https://www.googleapis.com/oauth2/v2/userinfo"

@router.get("/login")
async def google_login():
    """Перенаправляет пользователя на Google для авторизации"""
    settings = get_settings()
    
    if not settings.google_client_id:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Google OAuth не настроен"
        )
    
    # Формируем redirect_uri на основе текущего запроса
    # В продакшене это будет из настроек
    redirect_uri = settings.google_redirect_uri or "http://localhost:8080/api/auth/google/callback"
    
    params = {
        "client_id": settings.google_client_id,
        "redirect_uri": redirect_uri,
        "response_type": "code",
        "scope": "openid email profile",
        "access_type": "offline",  # Для получения refresh token
        "prompt": "consent",  # Всегда запрашивать согласие
    }
    
    auth_url = f"{GOOGLE_AUTH_URL}?{urlencode(params)}"
    return RedirectResponse(url=auth_url)

@router.get("/callback")
async def google_callback(
    code: str | None = None,
    error: str | None = None,
    db: AsyncSession = Depends(get_db)
):
    """Обрабатывает callback от Google"""
    if error:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ошибка авторизации Google: {error}"
        )
    
    if not code:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Код авторизации не получен"
        )
    
    settings = get_settings()
    redirect_uri = settings.google_redirect_uri or "http://localhost:8080/api/auth/google/callback"
    
    # Обмениваем код на токен
    async with httpx.AsyncClient() as client:
        token_response = await client.post(
            GOOGLE_TOKEN_URL,
            data={
                "code": code,
                "client_id": settings.google_client_id,
                "client_secret": settings.google_client_secret,
                "redirect_uri": redirect_uri,
                "grant_type": "authorization_code",
            },
        )
        
        if token_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Не удалось получить токен от Google"
            )
        
        token_data = token_response.json()
        access_token = token_data.get("access_token")
        
        if not access_token:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Токен доступа не получен"
            )
        
        # Получаем данные пользователя
        userinfo_response = await client.get(
            GOOGLE_USERINFO_URL,
            headers={"Authorization": f"Bearer {access_token}"},
        )
        
        if userinfo_response.status_code != 200:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Не удалось получить данные пользователя"
            )
        
        google_user = userinfo_response.json()
    
    # Извлекаем данные из Google
    email = google_user.get("email", "").lower()
    google_id = google_user.get("id")
    name = google_user.get("name", "")
    picture = google_user.get("picture")
    
    if not email:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Email не получен от Google"
        )
    
    # Проверяем, существует ли пользователь
    existing_user = await fetch_user_by_login(email)
    
    if existing_user:
        # Пользователь существует - просто логиним
        user_id = int(existing_user["id"])
    else:
        # Создаем нового пользователя
        # Генерируем username из email или имени
        username = _generate_username_from_google(name, email)
        
        # Создаем пользователя без пароля (OAuth пользователи не имеют пароля)
        user_data = await create_user(
            username=username,
            email=email,
            hashed_password="",  # OAuth пользователи не имеют пароля
        )
        user_id = user_data["id"]
    
    # Создаем JWT токены
    access = create_access_token(user_id)
    refresh = await create_refresh_token(db, user_id)
    
    # Перенаправляем на фронтенд с токенами в query параметрах
    # Или используем cookie/session для более безопасной передачи
    frontend_url = "http://localhost:8080"  # В продакшене из настроек
    redirect_url = f"{frontend_url}/auth/callback?access_token={access}&refresh_token={refresh}"
    
    return RedirectResponse(url=redirect_url)

def _generate_username_from_google(name: str, email: str) -> str:
    """Генерирует username из данных Google"""
    import re
    USERNAME_ALLOWED_RE = re.compile(r"[^A-Za-z0-9_.-]+")
    
    # Пробуем использовать имя
    base = name.strip() if name else email.split("@", 1)[0]
    base = USERNAME_ALLOWED_RE.sub("-", base)
    base = base.strip("-_.")[:32]
    
    if len(base) < 3:
        base = email.split("@", 1)[0][:32]
        base = USERNAME_ALLOWED_RE.sub("-", base)
    
    if len(base) < 3:
        base = base.ljust(3, "0")
    
    return base
```

---

### Этап 5: Backend - Регистрация роутера

**Файл: `auth_service/app/main.py`**
```python
from .routers import auth, oauth  # Добавить oauth

app.include_router(auth.router)
app.include_router(oauth.router)  # Добавить
```

---

### Этап 6: Frontend - Кнопка "Войти через Google"

**Файл: `backend/web/login.html`**
```html
<button onclick="loginWithGoogle()" class="btn-google">
    <i class="fab fa-google"></i>
    Войти через Google
</button>
```

**Файл: `backend/web/scripts/auth-pages.js`** (или новый файл)
```javascript
function loginWithGoogle() {
    window.location.href = '/api/auth/google/login';
}

// Обработка callback после авторизации
function handleGoogleCallback() {
    const urlParams = new URLSearchParams(window.location.search);
    const accessToken = urlParams.get('access_token');
    const refreshToken = urlParams.get('refresh_token');
    
    if (accessToken && refreshToken) {
        // Сохраняем токены
        localStorage.setItem('access_token', accessToken);
        localStorage.setItem('refresh_token', refreshToken);
        
        // Перенаправляем на главную или профиль
        window.location.href = '/profile';
    }
}

// Вызываем при загрузке страницы /auth/callback
if (window.location.pathname === '/auth/callback') {
    handleGoogleCallback();
}
```

---

### Этап 7: Обновление модели пользователя (опционально)

Можно добавить поле для хранения Google ID:

**Миграция:**
```python
# alembic/versions/XXXX_add_google_id.py
def upgrade():
    op.add_column('users', sa.Column('google_id', sa.String(255), nullable=True, unique=True))
    op.create_index('ix_users_google_id', 'users', ['google_id'])
```

---

## Альтернативные библиотеки

### 1. **python-social-auth / social-auth-app-fastapi**
- Готовая библиотека для OAuth
- Поддерживает множество провайдеров (Google, Facebook, GitHub и т.д.)
- Упрощает интеграцию

### 2. **Authlib**
- Современная библиотека для OAuth/OIDC
- Хорошая документация
- Поддержка FastAPI

### 3. **Нативная реализация** (рекомендуется)
- Полный контроль над процессом
- Меньше зависимостей
- Легче кастомизировать

---

## Безопасность

1. **Хранение Client Secret**: Только в переменных окружения, никогда в коде
2. **HTTPS**: Обязательно в продакшене
3. **State параметр**: Защита от CSRF атак
4. **Валидация токенов**: Проверка подписи Google
5. **Хранение Google ID**: Для связи аккаунтов

---

## Дополнительные возможности

1. **Связывание аккаунтов**: Позволить пользователю связать Google аккаунт с существующим
2. **Отвязка аккаунта**: Удаление связи с Google
3. **Множественные провайдеры**: Добавить Facebook, GitHub, VK и т.д.

---

## Примеры использования

### Простой вариант (текущий план)
- Кнопка "Войти через Google" → перенаправление → callback → токены → авторизация

### Продвинутый вариант
- Модальное окно с Google Sign-In
- Автоматическое связывание аккаунтов
- Управление связанными аккаунтами в профиле

---

## Следующие шаги

1. ✅ Создать проект в Google Cloud Console
2. ✅ Получить Client ID и Secret
3. ✅ Добавить зависимости
4. ✅ Реализовать endpoints
5. ✅ Добавить кнопку на фронтенде
6. ✅ Протестировать
7. ✅ Настроить для продакшена

