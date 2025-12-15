# 🔧 Исправление бесконечного цикла редиректов Grafana

**Проблема:** Бесконечный цикл редиректов 301 при доступе к `/grafana/`

**Симптомы:**
- Запросы к `/grafana/` возвращают 301 редирект
- Браузер следует редиректу, получает снова 301
- Цикл повторяется бесконечно
- В логах видно множество запросов `GET /grafana/ HTTP/2.0" 301` или `GET /grafana// HTTP/2.0" 301`
- Проблема с двойными слешами: `/grafana//` вместо `/grafana/`

---

## 🔍 Причина проблемы

Grafana при работе из подпути делает редиректы, которые nginx не обрабатывает правильно. Возможные причины:

1. **Grafana редиректит на `/login`** вместо `/grafana/login`
2. **Grafana редиректит на корень `/`** вместо `/grafana/`
3. **Неправильная обработка редиректов** в nginx (`proxy_redirect`)
4. **Проблема с `proxy_redirect default`** - он может создавать конфликты

---

## ✅ Решение

### 1. Обновлена конфигурация nginx (`nginx/gateway.prod.conf`)

**Изменения:**
- ✅ Убран `proxy_redirect default` (может создавать проблемы)
- ✅ Добавлена обработка `/grafana` без trailing slash (редирект на `/grafana/`)
- ✅ Улучшены правила `proxy_redirect` для обработки всех вариантов редиректов
- ✅ Добавлена обработка редиректа на корень: `proxy_redirect ~^/$ /grafana/;`
- ✅ Исправлен порядок location (более специфичные ПЕРЕД менее специфичными)

### 2. Проверка переменных окружения Grafana

Убедитесь, что в `docker-compose.yml` установлены правильные переменные:

```yaml
environment:
  - GF_SERVER_ROOT_URL=https://chessmint.ru/grafana/
  - GF_SERVER_SERVE_FROM_SUB_PATH=true
  - GF_SERVER_DOMAIN=chessmint.ru
```

**Критично:** `GF_SERVER_ROOT_URL` должен заканчиваться на `/grafana/` с trailing slash!

---

## 🚀 Применение исправления на production

### Шаг 1: Обновить конфигурацию

```bash
# На сервере обновить файл nginx/gateway.prod.conf
# (уже обновлен в репозитории)
```

### Шаг 2: Перезагрузить nginx (gateway)

```bash
# Проверить конфигурацию
docker-compose exec gateway nginx -t

# Если OK, перезагрузить
docker-compose exec gateway nginx -s reload

# Или перезапустить контейнер
docker-compose restart gateway
```

### Шаг 3: Проверить логи

```bash
# Проверить логи gateway
docker-compose logs -f gateway | grep grafana

# Проверить логи grafana
docker-compose logs -f grafana
```

### Шаг 4: Проверить доступ

1. Откройте `https://chessmint.ru/grafana/`
2. Должен открыться интерфейс Grafana **без редиректов**
3. В консоли браузера (F12 → Network) не должно быть циклов редиректов

---

## 🔍 Диагностика

### Если проблема сохраняется:

#### 1. Проверить, что именно возвращает Grafana:

```bash
# Проверить заголовки ответа
curl -I https://chessmint.ru/grafana/

# Должен вернуть 200 OK, а не 301
```

#### 2. Проверить логи Grafana:

```bash
docker-compose logs grafana | grep -i "redirect\|error" | tail -20
```

#### 3. Проверить переменные окружения Grafana:

```bash
docker-compose exec grafana env | grep GF_SERVER
```

Должно быть:
```
GF_SERVER_ROOT_URL=https://chessmint.ru/grafana/
GF_SERVER_SERVE_FROM_SUB_PATH=true
```

#### 4. Проверить конфигурацию nginx:

```bash
docker-compose exec gateway nginx -t
```

#### 5. Проверить, что Grafana доступна внутри контейнера:

```bash
docker-compose exec grafana curl http://localhost:3000/api/health
```

---

## 🔧 Альтернативные решения

### Вариант 1: Использовать поддомен (рекомендуется для production)

Вместо `/grafana/` использовать поддомен `grafana.chessmint.ru`:

1. **Добавить DNS запись:**
   ```
   grafana.chessmint.ru → IP сервера
   ```

2. **Изменить docker-compose.yml:**
   ```yaml
   grafana:
     environment:
       - GF_SERVER_ROOT_URL=https://grafana.chessmint.ru/
       - GF_SERVER_SERVE_FROM_SUB_PATH=false  # Не нужен для поддомена
   ```

3. **Настроить nginx-proxy:**
   - nginx-proxy автоматически создаст конфигурацию для нового домена
   - Или добавить в docker-compose.yml:
     ```yaml
     grafana:
       environment:
         - VIRTUAL_HOST=grafana.chessmint.ru
         - VIRTUAL_PORT=3000
     ```

**Преимущества:**
- Нет проблем с редиректами
- Проще настройка
- Лучше для production

### Вариант 2: Пробросить порт напрямую (только для тестирования)

Временно добавить в `docker-compose.yml`:
```yaml
grafana:
  ports:
    - "3000:3000"
```

И зайти напрямую: `http://your-server-ip:3000`

⚠️ **Не рекомендуется для production** - нужно закрыть порт файрволом и использовать только для отладки

---

## 📝 Текущая конфигурация

### nginx/gateway.prod.conf:

```nginx
# Обработка /grafana без trailing slash
location = /grafana {
    return 301 /grafana/;
}

# Обработка /grafana// (двойной слеш) - нормализация
location ~ ^/grafana//+(.*)$ {
    return 301 /grafana/$1;
}

location /grafana/ {
    # Нормализация двойных слешей в URI перед проксированием
    rewrite ^/grafana//+(.*)$ /grafana/$1 break;
    
    proxy_pass http://grafana:3000/;
    proxy_http_version 1.1;
    
    # Заголовки для работы из подпути
    proxy_set_header X-Forwarded-Prefix /grafana;
    proxy_set_header X-Script-Name /grafana;
    
    # Обработка редиректов (включая двойные слеши)
    proxy_redirect http://$host/grafana// /grafana/;
    proxy_redirect https://$host/grafana// /grafana/;
    proxy_redirect ~^/grafana//+(.*)$ /grafana/$1;
    proxy_redirect ~^/$ /grafana/;
    # ... другие proxy_redirect правила
}
```

### docker-compose.yml:

```yaml
grafana:
  environment:
    - GF_SERVER_ROOT_URL=https://chessmint.ru/grafana/
    - GF_SERVER_SERVE_FROM_SUB_PATH=true
```

---

## ✅ Проверка после исправления

После применения исправления:

1. ✅ Откройте `https://chessmint.ru/grafana/` - должен открыться интерфейс
2. ✅ Войдите с учетными данными `admin/admin`
3. ✅ Проверьте, что дашборды загружаются
4. ✅ Проверьте, что нет редиректов в консоли браузера (F12 → Network)
5. ✅ Проверьте логи - не должно быть циклов 301

---

## 🚨 Если проблема не решена

Если после всех исправлений проблема сохраняется:

1. **Проверить логи nginx-proxy:**
   ```bash
   docker-compose logs nginx-proxy | grep grafana
   ```

2. **Проверить, что nginx-proxy не делает свой редирект:**
   - nginx-proxy может делать редирект с HTTP на HTTPS
   - Это нормально, но может конфликтовать с редиректами Grafana

3. **Временно отключить nginx-proxy и использовать только gateway:**
   - Для тестирования можно временно остановить nginx-proxy
   - И обращаться напрямую к gateway на порту 80

4. **Использовать поддомен (рекомендуется):**
   - Это самое надежное решение для production

---

**Последнее обновление:** 2025-01-21
