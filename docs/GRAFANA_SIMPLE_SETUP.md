# 🚀 Простая настройка Grafana (без проблем с редиректами)

**Основано на:** [Пример docker-compose для Grafana + Loki](https://dmosk.ru/instruktions.php?object=docker-grafana-loki)

---

## 🎯 Проблема

Текущая конфигурация использует Grafana из подпути `/grafana/`, что создает проблемы с редиректами:
- Бесконечные циклы редиректов 301
- Проблемы с двойными слешами `/grafana//`
- Сложная конфигурация nginx

---

## ✅ Решение: Использовать отдельный порт или поддомен

### Вариант 1: Отдельный порт (проще, но требует файрвола)

#### 1. Обновить `docker-compose.yml`:

```yaml
grafana:
  image: grafana/grafana:11.2.0
  depends_on:
    - prometheus
    - loki
  ports:
    - "3000:3000"  # Пробрасываем порт напрямую
  environment:
    - GF_SECURITY_ADMIN_USER=admin
    - GF_SECURITY_ADMIN_PASSWORD=admin
    # Убираем настройки подпути - используем прямой доступ
    - GF_SERVER_ROOT_URL=https://chessmint.ru:3000/
    - GF_SERVER_SERVE_FROM_SUB_PATH=false  # НЕ нужен для прямого доступа
    - GF_SERVER_DOMAIN=chessmint.ru
    - GF_SERVER_ROUTER_LOGGING=false
    - GF_ANALYTICS_REPORTING_ENABLED=false
    - GF_ANALYTICS_CHECK_FOR_UPDATES=false
    - GF_SERVER_ENABLE_GZIP=true
    - GF_PATHS_PROVISIONING=/etc/grafana/provisioning
  volumes:
    - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    - grafana-data:/var/lib/grafana
  restart: unless-stopped
```

#### 2. Удалить конфигурацию Grafana из nginx:

Удалить из `nginx/gateway.prod.conf`:
```nginx
# Удалить все блоки location для /grafana/
```

#### 3. Настроить файрвол (UFW):

```bash
# Разрешить доступ к порту 3000 только с определенных IP
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000

# Или закрыть порт полностью и использовать VPN/SSH туннель
sudo ufw deny 3000
```

#### 4. Доступ к Grafana:

```
https://chessmint.ru:3000
```

**Преимущества:**
- ✅ Нет проблем с редиректами
- ✅ Простая конфигурация
- ✅ Работает "из коробки"

**Недостатки:**
- ⚠️ Нужно настраивать файрвол
- ⚠️ Порт виден в URL

---

### Вариант 2: Поддомен (рекомендуется для production)

#### 1. Добавить DNS запись:

```
grafana.chessmint.ru → IP сервера
```

#### 2. Обновить `docker-compose.yml`:

```yaml
grafana:
  image: grafana/grafana:11.2.0
  depends_on:
    - prometheus
    - loki
  expose:
    - "3000"
  environment:
    - GF_SECURITY_ADMIN_USER=admin
    - GF_SECURITY_ADMIN_PASSWORD=admin
    # Используем поддомен
    - GF_SERVER_ROOT_URL=https://grafana.chessmint.ru/
    - GF_SERVER_SERVE_FROM_SUB_PATH=false  # НЕ нужен для поддомена
    - GF_SERVER_DOMAIN=grafana.chessmint.ru
    - GF_SERVER_ROUTER_LOGGING=false
    - GF_ANALYTICS_REPORTING_ENABLED=false
    - GF_ANALYTICS_CHECK_FOR_UPDATES=false
    - GF_SERVER_ENABLE_GZIP=true
    - GF_PATHS_PROVISIONING=/etc/grafana/provisioning
    # Для работы с nginx-proxy
    - VIRTUAL_HOST=grafana.chessmint.ru
    - VIRTUAL_PORT=3000
    - LETSENCRYPT_HOST=grafana.chessmint.ru
    - LETSENCRYPT_EMAIL=${LETSENCRYPT_EMAIL}
  volumes:
    - ./monitoring/grafana/provisioning:/etc/grafana/provisioning:ro
    - grafana-data:/var/lib/grafana
  restart: unless-stopped
```

#### 3. nginx-proxy автоматически создаст конфигурацию

nginx-proxy автоматически создаст конфигурацию для `grafana.chessmint.ru` и настроит SSL через Let's Encrypt.

#### 4. Доступ к Grafana:

```
https://grafana.chessmint.ru
```

**Преимущества:**
- ✅ Нет проблем с редиректами
- ✅ Красивый URL без порта
- ✅ Автоматический SSL через Let's Encrypt
- ✅ Не нужно настраивать файрвол
- ✅ Лучше для production

**Недостатки:**
- ⚠️ Нужно настроить DNS

---

## 📋 Сравнение подходов

| Критерий | Подпуть `/grafana/` | Отдельный порт | Поддомен |
|----------|---------------------|----------------|----------|
| Простота настройки | ❌ Сложно | ✅ Просто | ✅ Просто |
| Проблемы с редиректами | ❌ Есть | ✅ Нет | ✅ Нет |
| Безопасность | ✅ Хорошо | ⚠️ Нужен файрвол | ✅ Хорошо |
| Красивый URL | ⚠️ `/grafana/` | ❌ `:3000` | ✅ `grafana.chessmint.ru` |
| SSL | ✅ Автоматически | ⚠️ Нужна настройка | ✅ Автоматически |
| Production ready | ⚠️ Проблемы | ⚠️ Требует настройки | ✅ Да |

---

## 🚀 Рекомендация

**Для production:** Использовать **поддомен** (`grafana.chessmint.ru`)

**Для разработки:** Использовать **отдельный порт** (`localhost:3000`)

---

## 📝 Пример полной конфигурации (как в статье)

### docker-compose.yml (упрощенный вариант):

```yaml
services:
  grafana:
    user: root
    image: grafana/grafana:11.2.0
    ports:
      - "3000:3000"
    volumes:
      - ./monitoring/grafana:/var/lib/grafana
      - ./monitoring/grafana/provisioning:/etc/grafana/provisioning
    container_name: grafana
    restart: unless-stopped
    environment:
      TZ: "Europe/Moscow"
      GF_SECURITY_ADMIN_USER: admin
      GF_SECURITY_ADMIN_PASSWORD: admin
      GF_SERVER_ROOT_URL: https://grafana.chessmint.ru/
      GF_SERVER_SERVE_FROM_SUB_PATH: "false"
      GF_SERVER_DOMAIN: grafana.chessmint.ru

  loki:
    image: grafana/loki:2.9.8
    container_name: loki-app
    restart: unless-stopped
    environment:
      TZ: "Europe/Moscow"
    volumes:
      - ./monitoring/loki/loki-config.yml:/etc/loki/loki-config.yml
      - loki-data:/loki
    ports:
      - "3100:3100"
    command: -config.file=/etc/loki/loki-config.yml

  promtail:
    image: grafana/promtail:2.9.8
    container_name: loki-promtail
    restart: unless-stopped
    environment:
      TZ: "Europe/Moscow"
    volumes:
      - /var/log:/var/log:ro
      - ./monitoring/promtail/promtail-config.yml:/etc/promtail/promtail-config.yml
      - /var/lib/docker/containers:/var/lib/docker/containers:ro
      - /var/run/docker.sock:/var/run/docker.sock:ro
    command: -config.file=/etc/promtail/promtail-config.yml
    depends_on:
      - loki

volumes:
  loki-data:
  grafana-data:
```

---

## 🔧 Миграция с текущей конфигурации

### Шаг 1: Выбрать вариант (рекомендуется поддомен)

### Шаг 2: Обновить docker-compose.yml

### Шаг 3: Если используете поддомен:
```bash
# Добавить DNS запись
# grafana.chessmint.ru → IP сервера
```

### Шаг 4: Удалить конфигурацию Grafana из nginx:

```bash
# Удалить блоки location /grafana/ из nginx/gateway.prod.conf
```

### Шаг 5: Перезапустить сервисы:

```bash
docker-compose down
docker-compose up -d
```

### Шаг 6: Проверить доступ:

```bash
# Для поддомена
curl -I https://grafana.chessmint.ru

# Для порта
curl -I https://chessmint.ru:3000
```

---

## ✅ Преимущества нового подхода

1. **Нет проблем с редиректами** - Grafana работает напрямую, без подпути
2. **Простая конфигурация** - не нужны сложные правила nginx
3. **Надежность** - меньше точек отказа
4. **Производительность** - нет дополнительных прокси-слоев для Grafana

---

**Последнее обновление:** 2025-01-21
