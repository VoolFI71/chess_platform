# Очистка стилей на главной странице

## Что сделано:

### 1. Удален огромный блок `<style>` из `index.html`

**Было:** 1476 строк inline стилей  
**Стало:** 0 строк (все в CSS файлах)

### 2. Созданы отдельные CSS файлы:

**`/styles/hero.css`** (163 строки):
- Hero section
- Анимированная шахматная доска
- Градиентные фоны
- Анимации (float, fadeInUp, pulse)

**`/styles/features.css`** (213 строк):
- Features карточки (6 штук)
- Hover эффекты
- Stagger анимации
- Адаптивная сетка

**`/styles/faq.css`** (268 строк):
- FAQ accordion
- Comparison table
- Final CTA section
- Responsive дизайн

**`/styles/how-it-works.css`** (163 строки):
- Секция "Как начать" (3 шага)
- Соединительные линии
- Анимированные номера шагов
- Иконки с градиентами

**`/styles/modals.css`** (480+ строк):
- Все модальные окна
- Auth модалы (login/register)
- Purchase modal
- Form стили

**`/styles/index-page.css`** (100 строк):
- Stats grid
- About section
- Специфичные для index.html стили

### 3. Inline стили в HTML

Осталось немного inline стилей в HTML (style="..."), но это:
- Уникальные цвета для specific элементов
- Одноразовые стили (margin, padding)
- Допустимо для utility-классов

**Можно оставить или вынести в utility классы.**

---

## Результат:

**До:**
```html
<head>
  <style>
    /* 1476 строк стилей */
  </style>
</head>
```

**После:**
```html
<head>
  <link rel="stylesheet" href="/styles/variables.css">
  <link rel="stylesheet" href="/styles/common.css">
  <link rel="stylesheet" href="/styles/hero.css">
  <link rel="stylesheet" href="/styles/features.css">
  <link rel="stylesheet" href="/styles/faq.css">
  <link rel="stylesheet" href="/styles/how-it-works.css">
  <link rel="stylesheet" href="/styles/modals.css">
  <link rel="stylesheet" href="/styles/index-page.css">
</head>
```

---

## Преимущества:

✅ **Модульность** - каждая секция в своем файле  
✅ **Кэширование** - CSS файлы кэшируются браузером  
✅ **Читаемость** - легче найти нужные стили  
✅ **Переиспользование** - можно использовать на других страницах  
✅ **Производительность** - браузер парсит CSS быстрее  
✅ **Разработка** - легче работать с отдельными файлами  

---

## Размер файлов:

- `index.html`: 2696 строк → 1200 строк (-55%)
- CSS файлы: ~1400 строк (разделено на 6 файлов)

**Итого:** Код стал значительно чище и поддерживаемее!

