# 📊 Как зайти в Grafana

## 🔐 Учетные данные

**Логин:** `admin`  
**Пароль:** `admin`

⚠️ **Важно:** В production рекомендуется изменить пароль на более безопасный!

---

## 🌐 Способы доступа

### 1. **Напрямую через порт (Production)**

**URL:** `https://chessmint.ru:3000`

**Текущая конфигурация:** Grafana работает напрямую через порт 3000, без nginx proxy.

**Требования:**
- Grafana сервис должен быть запущен в Docker
- Порт 3000 должен быть открыт в файрволе (для вашего IP)

---

### 2. **Локальная разработка**

Если используете `docker-compose.local.yml`:
```
http://localhost:3000
```

---

### 3. **Через SSH туннель (рекомендуется для безопасности)**

```bash
# На локальной машине создать SSH туннель
ssh -L 3000:localhost:3000 user@chessmint.ru

# Затем открыть в браузере:
http://localhost:3000
```

---

## 🚀 Быстрый старт

### Проверка, что Grafana запущена:

```bash
# Проверить статус контейнера
docker ps | grep grafana

# Или через docker-compose
docker-compose ps grafana
```

### Запуск Grafana (если не запущена):

```bash
# Запустить все сервисы
docker-compose up -d

# Или только Grafana
docker-compose up -d grafana
```

### Проверка логов:

```bash
docker-compose logs grafana
```

---

## 🔧 Настройки Grafana

### Текущая конфигурация (из docker-compose.yml):

- **Версия:** Grafana 11.2.0
- **Порт:** `3000:3000` (проброшен напрямую)
- **Root URL:** `https://chessmint.ru:3000/` (production)
- **Работа из подпути:** Нет (`GF_SERVER_SERVE_FROM_SUB_PATH=false`)
- **Домен:** `chessmint.ru`
- **Provisioning:** `/etc/grafana/provisioning` (из `./monitoring/grafana/provisioning`)
- **Nginx proxy:** Отключен (Grafana работает напрямую)

### Данные сохраняются в:
- **Volume:** `grafana-data` (Docker volume)
- **Путь в контейнере:** `/var/lib/grafana`

---

## 📝 Troubleshooting

### Проблема: Не могу зайти в Grafana

**Решение 1:** Проверить, что контейнер запущен
```bash
docker-compose ps grafana
```

**Решение 2:** Проверить логи
```bash
docker-compose logs grafana
```

**Решение 3:** Проверить, что nginx проксирует запросы
```bash
# Проверить конфигурацию nginx
cat nginx/gateway.prod.conf | grep -A 20 "location /grafana"
```

**Решение 4:** Проверить доступность порта
```bash
# Проверить, что Grafana слушает на порту 3000 внутри контейнера
docker-compose exec grafana netstat -tuln | grep 3000
```

### Проблема: Не могу подключиться к порту 3000

**Причина:** Порт может быть закрыт файрволом

**Решение:** 
```bash
# Проверить статус файрвола
sudo ufw status

# Разрешить доступ к порту 3000 с вашего IP
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000
```

### Проблема: Ошибка подключения

**Причина:** Grafana может не быть запущена или порт занят

**Решение:** 
```bash
# Проверить статус контейнера
docker-compose ps grafana

# Проверить логи
docker-compose logs grafana

# Проверить, что порт слушается
sudo netstat -tuln | grep 3000
```

---

## 🔒 Безопасность

### Рекомендации для production:

1. **Изменить пароль администратора:**
   - Зайти в Grafana
   - Settings → Users → Admin → Change Password

2. **Или изменить через переменные окружения:**
   ```yaml
   environment:
     - GF_SECURITY_ADMIN_PASSWORD=your_secure_password
   ```

3. **Ограничить доступ:**
   - Настроить аутентификацию через nginx
   - Использовать VPN или whitelist IP
   - Настроить OAuth/SSO

---

## 📊 Что можно делать в Grafana

1. **Просматривать метрики из Prometheus**
   - Дашборды уже настроены через provisioning
   - Источники данных автоматически добавляются

2. **Просматривать логи из Loki**
   - Настроен как источник данных
   - Можно создавать запросы к логам

3. **Создавать дашборды**
   - Мониторинг сервисов
   - Метрики производительности
   - Алерты

---

## 🔗 Полезные ссылки

- **Grafana документация:** https://grafana.com/docs/
- **Prometheus как источник данных:** https://grafana.com/docs/grafana/latest/datasources/prometheus/
- **Loki как источник данных:** https://grafana.com/docs/grafana/latest/datasources/loki/

---

**Последнее обновление:** 2025-01-21
