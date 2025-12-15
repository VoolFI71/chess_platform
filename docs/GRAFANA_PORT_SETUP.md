# 🔧 Настройка Grafana через отдельный порт

**Статус:** ✅ Конфигурация обновлена

---

## ✅ Что было сделано

### 1. Обновлен `docker-compose.yml`:

- ✅ Проброшен порт `3000:3000` для прямого доступа
- ✅ Изменен `GF_SERVER_ROOT_URL` на `https://chessmint.ru:3000/`
- ✅ Установлен `GF_SERVER_SERVE_FROM_SUB_PATH=false`
- ✅ Удалены настройки подпути

### 2. Удалена конфигурация из nginx:

- ✅ Удалены все блоки `location /grafana/` из `nginx/gateway.prod.conf`
- ✅ Grafana теперь работает напрямую, без nginx proxy

---

## 🔐 Доступ к Grafana

**URL:** `https://chessmint.ru:3000`

**Учетные данные:**
- Логин: `admin`
- Пароль: `admin`

⚠️ **Важно:** В production рекомендуется изменить пароль!

---

## 🔥 Настройка файрвола (UFW)

### Вариант 1: Разрешить доступ только с определенных IP

```bash
# Разрешить доступ к порту 3000 только с вашего IP
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000

# Пример:
sudo ufw allow from 77.91.77.118 to any port 3000
```

### Вариант 2: Разрешить доступ только по HTTPS (порт 443)

Если вы хотите использовать только HTTPS через nginx-proxy (если он настроен), можно закрыть порт 3000:

```bash
# Закрыть порт 3000 для внешнего доступа
sudo ufw deny 3000

# Или разрешить только локально
sudo ufw allow from 127.0.0.1 to any port 3000
```

### Вариант 3: Использовать SSH туннель (самый безопасный)

```bash
# На локальной машине создать SSH туннель
ssh -L 3000:localhost:3000 user@chessmint.ru

# Затем открыть в браузере:
# http://localhost:3000
```

---

## 🚀 Применение изменений

### Шаг 1: Перезапустить сервисы

```bash
# Остановить контейнеры
docker-compose down

# Запустить с новой конфигурацией
docker-compose up -d

# Проверить, что Grafana запущена
docker-compose ps grafana
```

### Шаг 2: Настроить файрвол

```bash
# Проверить текущие правила
sudo ufw status

# Добавить правило для порта 3000 (выберите один из вариантов выше)
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000

# Применить изменения
sudo ufw reload
```

### Шаг 3: Проверить доступ

```bash
# Проверить, что порт открыт
curl -I https://chessmint.ru:3000

# Должен вернуть 200 OK или 302 (редирект на /login)
```

---

## 🔍 Проверка конфигурации

### Проверить переменные окружения Grafana:

```bash
docker-compose exec grafana env | grep GF_SERVER
```

Должно быть:
```
GF_SERVER_ROOT_URL=https://chessmint.ru:3000/
GF_SERVER_SERVE_FROM_SUB_PATH=false
```

### Проверить логи Grafana:

```bash
docker-compose logs grafana | tail -20
```

### Проверить, что порт слушается:

```bash
# На сервере
sudo netstat -tuln | grep 3000

# Или через docker
docker-compose exec grafana netstat -tuln | grep 3000
```

---

## 🔒 Безопасность

### Рекомендации:

1. **Изменить пароль по умолчанию:**
   - Зайти в Grafana → Administration → Users → admin → Change Password

2. **Ограничить доступ по IP:**
   ```bash
   sudo ufw allow from YOUR_IP_ADDRESS to any port 3000
   ```

3. **Использовать SSH туннель** (самый безопасный вариант)

4. **Настроить SSL/TLS** (если нужно):
   - Можно использовать nginx-proxy для автоматического SSL
   - Или настроить SSL напрямую в Grafana

---

## 📝 Текущая конфигурация

### docker-compose.yml:

```yaml
grafana:
  image: grafana/grafana:11.2.0
  ports:
    - "3000:3000"
  environment:
    - GF_SERVER_ROOT_URL=https://chessmint.ru:3000/
    - GF_SERVER_SERVE_FROM_SUB_PATH=false
```

### nginx/gateway.prod.conf:

```nginx
# Grafana теперь доступна напрямую через порт 3000
# Конфигурация удалена - Grafana работает без nginx proxy
```

---

## ✅ Преимущества

1. ✅ **Нет проблем с редиректами** - Grafana работает напрямую
2. ✅ **Простая конфигурация** - не нужны сложные правила nginx
3. ✅ **Быстрая работа** - нет дополнительных прокси-слоев
4. ✅ **Легко отлаживать** - прямой доступ к Grafana

---

## ⚠️ Важные замечания

1. **Файрвол обязателен** - порт 3000 должен быть защищен
2. **SSL через порт** - если нужен HTTPS, нужно настроить SSL в Grafana или использовать nginx-proxy
3. **Пароль по умолчанию** - обязательно изменить `admin/admin`

---

**Последнее обновление:** 2025-01-21
