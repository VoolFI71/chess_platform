# 🔥 Настройка файрвола для Grafana (порт 3000)

---

## 🎯 Цель

Ограничить доступ к Grafana (порт 3000) только для авторизованных IP-адресов.

---

## 🔧 Настройка UFW (Uncomplicated Firewall)

### Шаг 1: Проверить текущий статус

```bash
sudo ufw status
```

### Шаг 2: Разрешить доступ только с вашего IP

```bash
# Заменить YOUR_IP_ADDRESS на ваш реальный IP
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000

# Пример:
sudo ufw allow from 77.91.77.118 to any port 3000
```

### Шаг 3: Применить изменения

```bash
sudo ufw reload
```

### Шаг 4: Проверить правила

```bash
sudo ufw status numbered
```

Должна быть строка:
```
[1] 3000/tcp                    ALLOW       YOUR_IP_ADDRESS
```

---

## 🔒 Дополнительные варианты безопасности

### Вариант 1: Разрешить доступ только локально

```bash
# Разрешить только с localhost
sudo ufw allow from 127.0.0.1 to any port 3000

# И использовать SSH туннель для доступа
ssh -L 3000:localhost:3000 user@chessmint.ru
```

### Вариант 2: Закрыть порт полностью и использовать SSH туннель

```bash
# Закрыть порт 3000
sudo ufw deny 3000

# На локальной машине создать туннель
ssh -L 3000:localhost:3000 user@chessmint.ru

# Открыть в браузере: http://localhost:3000
```

### Вариант 3: Разрешить доступ с нескольких IP

```bash
# Добавить несколько правил для разных IP
sudo ufw allow from 77.91.77.118 to any port 3000
sudo ufw allow from 192.168.1.100 to any port 3000
sudo ufw allow from 10.0.0.50 to any port 3000
```

---

## 🧪 Проверка работы

### Проверить, что порт доступен:

```bash
# С вашего IP (должно работать)
curl -I https://chessmint.ru:3000

# С другого IP (должно быть заблокировано)
# Попробовать с другого сервера или использовать VPN
```

### Проверить логи файрвола:

```bash
# Посмотреть последние блокировки
sudo tail -f /var/log/ufw.log | grep 3000
```

---

## 📝 Пример полной настройки

```bash
# 1. Проверить статус
sudo ufw status

# 2. Если файрвол не активен, включить
sudo ufw enable

# 3. Разрешить SSH (важно сделать ПЕРЕД блокировкой всего!)
sudo ufw allow 22/tcp

# 4. Разрешить доступ к Grafana с вашего IP
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000

# 5. Применить изменения
sudo ufw reload

# 6. Проверить правила
sudo ufw status numbered
```

---

## ⚠️ Важные замечания

1. **Не блокируйте SSH порт (22)** - иначе потеряете доступ к серверу!
2. **Проверьте IP адрес** - используйте `curl ifconfig.me` для проверки вашего IP
3. **Сохраните правила** - UFW сохраняет правила автоматически при перезагрузке
4. **Тестируйте осторожно** - сначала разрешите доступ, потом проверьте

---

## 🔍 Диагностика проблем

### Проблема: Не могу подключиться даже с разрешенного IP

**Решение:**
```bash
# Проверить, что файрвол активен
sudo ufw status

# Проверить правила
sudo ufw status numbered

# Проверить логи
sudo tail -f /var/log/ufw.log
```

### Проблема: Порт все еще доступен со всех IP

**Решение:**
```bash
# Проверить, нет ли других правил, разрешающих доступ
sudo ufw status | grep 3000

# Удалить общее правило, если есть
sudo ufw delete allow 3000

# Добавить правило только для вашего IP
sudo ufw allow from YOUR_IP_ADDRESS to any port 3000
```

---

## 📚 Дополнительные ресурсы

- [Документация UFW](https://help.ubuntu.com/community/UFW)
- [SSH туннелирование](https://www.ssh.com/academy/ssh/tunneling)

---

**Последнее обновление:** 2025-01-21
