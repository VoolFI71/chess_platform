# 🔒 Расположение уязвимостей безопасности

**Дата:** 2025-01-21

---

## 🔴 XSS УЯЗВИМОСТИ в `leaderboard.html`

### Место 1: Строка 307-320

**Файл:** `backend/web/leaderboard.html`

**Код:**
```javascript
const formatStats = getFormatStats(userStats, state.currentFormat);
if (formatStats) {
    stats.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-trophy"></i>
            <span>Побед: ${formatStats.wins || 0}</span>
        </div>
        <div class="stat-item">
            <i class="fas fa-chess"></i>
            <span>Партий: ${formatStats.games || 0}</span>
        </div>
        <div class="stat-item">
            <i class="fas fa-percentage"></i>
            <span>Побед: ${Math.round(formatStats.win_rate || 0)}%</span>
        </div>
    `;
}
```

**Проблема:**
- Используется `innerHTML` с данными из `formatStats` (wins, games, win_rate)
- Если эти значения содержат HTML (например, `<script>alert('XSS')</script>`), они будут выполнены
- Данные приходят с сервера через API, но не экранируются перед вставкой

**Риск:** Средний-Высокий
- Если API возвращает некорректные данные или злоумышленник может влиять на данные в БД, возможен XSS
- В данном случае данные числовые (wins, games, win_rate), но лучше использовать безопасные методы

---

### Место 2: Строка 322-327

**Файл:** `backend/web/leaderboard.html`

**Код:**
```javascript
} else {
    stats.innerHTML = `
        <div class="stat-item">
            <i class="fas fa-star"></i>
            <span>Рейтинг: ${entry.rating}</span>
        </div>
    `;
}
```

**Проблема:**
- Используется `innerHTML` с `entry.rating`
- Если рейтинг содержит HTML, возможен XSS
- Рейтинг должен быть числом, но если API вернет строку с HTML, будет уязвимость

**Риск:** Средний
- Рейтинг обычно число, но без валидации на клиенте есть риск

---

### Место 3: Строка 396 (в функции `createLeaderboardCard`)

**Файл:** `backend/web/leaderboard.html`

**Код:**
```javascript
stats.innerHTML = `
    <div class="stat-item">
        <i class="fas fa-trophy"></i>
        <span>Побед: ${formatStats.wins || 0}</span>
    </div>
    <div class="stat-item">
        <i class="fas fa-chess"></i>
        <span>Партий: ${formatStats.games || 0}</span>
    </div>
    <div class="stat-item">
        <i class="fas fa-percentage"></i>
        <span>Побед: ${Math.round(formatStats.win_rate || 0)}%</span>
    </div>
`;
```

**Проблема:**
- Та же проблема, что в Месте 1
- Используется `innerHTML` с данными из `formatStats`

**Риск:** Средний-Высокий

---

### Дополнительные места с innerHTML (менее критичные):

**Строка 283-285:**
```javascript
if (position === 1) medal.innerHTML = '<i class="fas fa-crown"></i>';
else if (position === 2) medal.innerHTML = '<i class="fas fa-medal"></i>';
else medal.innerHTML = '<i class="fas fa-medal"></i>';
```
- **Риск:** Низкий (статический HTML, не содержит пользовательских данных)

**Строка 433, 434, 471, 481, 531, 548:**
```javascript
podiumContainer.innerHTML = '';
cardsContainer.innerHTML = '';
```
- **Риск:** Низкий (очистка контейнеров, не содержит данных)

---

## 🔴 SQL INJECTION в `game_service.go`

### Место 1: Строка 695-696 (SELECT запросы)

**Файл:** `games_service_go/internal/services/game_service.go`

**Функция:** `updateRatings`

**Код:**
```go
formatType := s.getGameFormat(tc)

// Получаем текущие рейтинги
var whiteRating, blackRating int
whiteQuery := fmt.Sprintf("SELECT %s_rating FROM users WHERE id = ?", formatType)
blackQuery := fmt.Sprintf("SELECT %s_rating FROM users WHERE id = ?", formatType)

if err := tx.WithContext(ctx).Raw(whiteQuery, *game.WhiteID).Scan(&whiteRating).Error; err != nil {
    return fmt.Errorf("failed to get white rating: %w", err)
}
```

**Проблема:**
- Используется `fmt.Sprintf` для вставки `formatType` в SQL запрос
- `formatType` получается из `s.getGameFormat(tc)`, где `tc` - это `TimeControl` из JSON
- Если `getGameFormat` возвращает невалидное значение или злоумышленник может влиять на `TimeControl`, возможен SQL injection

**Пример атаки:**
Если `formatType = "bullet; DROP TABLE users; --"`, то запрос станет:
```sql
SELECT bullet; DROP TABLE users; --_rating FROM users WHERE id = ?
```

**Риск:** Высокий (если `getGameFormat` не валидирует значения)

---

### Место 2: Строка 741-742 (UPDATE запрос для белых)

**Файл:** `games_service_go/internal/services/game_service.go`

**Функция:** `updateRatings`

**Код:**
```go
// Обновляем рейтинги
ratingColumn := fmt.Sprintf("%s_rating", formatType)
if err := tx.WithContext(ctx).Exec(fmt.Sprintf("UPDATE users SET %s = ? WHERE id = ?", ratingColumn), whiteRatingAfter, *game.WhiteID).Error; err != nil {
    return fmt.Errorf("failed to update white rating: %w", err)
}
```

**Проблема:**
- Используется `fmt.Sprintf` для вставки `ratingColumn` (который создается из `formatType`) в SQL запрос
- Если `formatType` содержит невалидные символы, возможен SQL injection

**Пример атаки:**
Если `formatType = "bullet; DROP TABLE users; --"`, то запрос станет:
```sql
UPDATE users SET bullet; DROP TABLE users; --_rating = ? WHERE id = ?
```

**Риск:** Высокий

---

### Место 3: Строка 746 (UPDATE запрос для черных)

**Файл:** `games_service_go/internal/services/game_service.go`

**Функция:** `updateRatings`

**Код:**
```go
if err := tx.WithContext(ctx).Exec(fmt.Sprintf("UPDATE users SET %s = ? WHERE id = ?", ratingColumn), blackRatingAfter, *game.BlackID).Error; err != nil {
    return fmt.Errorf("failed to update black rating: %w", err)
}
```

**Проблема:**
- Та же проблема, что в Месте 2
- Используется `ratingColumn`, созданный из `formatType` через `fmt.Sprintf`

**Риск:** Высокий

---

## 🔍 АНАЛИЗ ФУНКЦИИ `getGameFormat`

**Файл:** `games_service_go/internal/services/game_service.go`  
**Строка:** 794-807

**Реальная реализация:**
```go
func (s *GameService) getGameFormat(timeControl *models.TimeControl) string {
	if timeControl == nil {
		return "rapid"
	}

	totalMinutes := float64(timeControl.InitialMs) / 60000.0
	if totalMinutes <= 3 {
		return "bullet"
	} else if totalMinutes <= 10 {
		return "blitz"
	} else {
		return "rapid"
	}
}
```

**Анализ безопасности:**
- ✅ Функция возвращает только жестко заданные строки: `"bullet"`, `"blitz"`, `"rapid"`
- ✅ Нет прямого использования пользовательского ввода в возвращаемом значении
- ⚠️ **НО:** Функция не использует whitelist/map для валидации
- ⚠️ **НО:** Если функция будет изменена в будущем и начнет возвращать значения из `TimeControl` напрямую, возможен SQL injection

**Риск SQL Injection:**
- **Текущий риск:** Низкий-Средний (функция возвращает только валидные значения)
- **Потенциальный риск:** Высокий (если функция изменится или если `TimeControl.InitialMs` может быть подделан для влияния на логику)

**Рекомендация:**
- Использовать whitelist map для получения имени колонки вместо `fmt.Sprintf`
- Это защитит от будущих изменений функции и сделает код более безопасным

---

## 📊 СВОДКА

### XSS уязвимости:
- **Всего мест:** 3 критичных (строки 307, 322, 396)
- **Риск:** Средний-Высокий
- **Причина:** Использование `innerHTML` с данными из API без экранирования

### SQL Injection уязвимости:
- **Всего мест:** 3 критичных (строки 695, 741, 746)
- **Риск:** Высокий
- **Причина:** Использование `fmt.Sprintf` для вставки `formatType` в SQL запросы

---

## ✅ РЕКОМЕНДАЦИИ

### Для XSS:
1. Заменить `innerHTML` на `textContent` или использовать `escapeHtml()`
2. Использовать DOM API для создания элементов вместо шаблонных строк
3. Валидировать данные на сервере перед отправкой клиенту

### Для SQL Injection:
1. Использовать whitelist для `formatType` (map с валидными значениями)
2. Использовать map для получения имени колонки вместо `fmt.Sprintf`
3. Валидировать `TimeControl` при создании игры

---

**Последнее обновление:** 2025-01-21
