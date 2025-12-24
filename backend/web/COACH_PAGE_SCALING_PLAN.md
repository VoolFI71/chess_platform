# План масштабирования страницы `/coach` для нескольких тренеров

## 🎯 Проблема
Сейчас страница `/coach` жестко привязана к одному тренеру (Григорий Пономарев). При добавлении новых тренеров нужно масштабируемое решение.

---

## ✅ Рекомендуемое решение: Динамическая загрузка через JavaScript

### Вариант 1: Query параметры (рекомендуется для начала)
**URL структура:**
```
/coach           → Григорий Пономарев (по умолчанию, для обратной совместимости)
/coach?coach=grisha → Григорий Пономарев
/coach?coach=ivan   → Иван Иванов
```

**Преимущества:**
- ✅ Не требует изменений в роутинге сервера
- ✅ Обратная совместимость (`/coach` работает)
- ✅ Легко реализовать
- ✅ Один HTML файл для всех тренеров

**Недостатки:**
- ⚠️ Менее SEO-friendly чем `/coach/grisha`
- ⚠️ URL менее чистый

---

### Вариант 2: Путь с slug (лучше для SEO, требует настройки)
**URL структура:**
```
/coach          → редирект на /coach/grisha или показывать первого тренера
/coach/grisha   → Григорий Пономарев
/coach/ivan     → Иван Иванов
```

**Преимущества:**
- ✅ SEO-friendly URLs
- ✅ Чистые и понятные URL
- ✅ Легко делиться ссылками

**Недостатки:**
- ⚠️ Требует настройки роутинга на backend (FastAPI)
- ⚠️ Нужно обработать редирект с `/coach`

**Реализация:**
- Backend должен отдавать `coach.html` для всех `/coach/*`
- JavaScript определяет slug из URL и загружает данные

---

## 🏗️ Техническая реализация (рекомендуется Вариант 1)

### Шаг 1: Создать JSON файл с данными тренеров

**Файл: `backend/web/data/coaches.json`**
```json
{
  "coaches": [
    {
      "id": "grisha",
      "slug": "grisha",
      "name": "Григорий Пономарев",
      "firstName": "Григорий",
      "lastName": "Пономарев",
      "title": "Мастер FIDE (FM), Чемпион России",
      "badge": "Мастер FIDE",
      "image": "/images/coaches/grisha.jpg",
      "telegram": "https://t.me/PROSTOCHELOVECK06",
      "description": "Опытный тренер, специализирующийся на персональном обучении. Поможет вам улучшить тактику, стратегию и дебютный репертуар.",
      "achievements": [
        "Чемпион России по Быстрым Шахматам до 17 лет 2022 г.",
        "Командный Чемпионат России по Шахматам Высшая Лига, 1 место",
        "Чемпионат Европы по Шахматам до 12 лет, 2 место"
      ],
      "methodology": "...",
      "meta": {
        "title": "Григорий Пономарев - Мастер FIDE | Шахматный тренер ChessMint",
        "description": "Григорий Пономарев - Мастер FIDE (FM), Чемпион России...",
        "keywords": "шахматные тренеры, персональный тренер по шахматам..."
      }
    }
  ]
}
```

---

### Шаг 2: Создать JavaScript для загрузки данных

**Файл: `backend/web/scripts/coach.js`**

```javascript
// Данные тренеров
let coachesData = null;
let currentCoach = null;

// Загрузка данных тренеров
async function loadCoachesData() {
  try {
    const response = await fetch('/data/coaches.json');
    if (!response.ok) throw new Error('Failed to load coaches data');
    const data = await response.json();
    coachesData = data.coaches;
    return data.coaches;
  } catch (error) {
    console.error('Error loading coaches data:', error);
    return [];
  }
}

// Получить ID тренера из URL
function getCoachIdFromURL() {
  const params = new URLSearchParams(window.location.search);
  const coachId = params.get('coach');
  
  // Если нет параметра, возвращаем дефолтного тренера (grisha)
  return coachId || 'grisha';
}

// Найти тренера по ID
function findCoachById(id) {
  if (!coachesData) return null;
  return coachesData.find(c => c.id === id || c.slug === id) || coachesData[0];
}

// Обновить мета-теги
function updateMetaTags(coach) {
  if (!coach) return;
  
  // Title
  document.title = coach.meta?.title || `${coach.name} - ${coach.title} | ChessMint`;
  
  // Meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.content = coach.meta?.description || `${coach.name} - ${coach.title}. ${coach.description}`;
  }
  
  // Canonical URL
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.href = `https://chessmint.ru/coach?coach=${coach.id}`;
  }
  
  // Open Graph
  updateOGTag('og:title', coach.meta?.title || `${coach.name} - ${coach.title}`);
  updateOGTag('og:description', coach.meta?.description || coach.description);
  updateOGTag('og:image', `https://chessmint.ru${coach.image}`);
  updateOGTag('og:url', `https://chessmint.ru/coach?coach=${coach.id}`);
  
  // Profile tags
  updateOGTag('profile:first_name', coach.firstName);
  updateOGTag('profile:last_name', coach.lastName);
}

function updateOGTag(property, content) {
  const tag = document.querySelector(`meta[property="${property}"]`);
  if (tag) tag.content = content;
}

// Обновить контент страницы
function updatePageContent(coach) {
  if (!coach) return;
  
  // Обновить хлебные крошки
  const breadcrumbName = document.querySelector('.breadcrumbs-list li[aria-current="page"]');
  if (breadcrumbName) {
    breadcrumbName.textContent = coach.name;
  }
  
  // Обновить hero секцию
  const coachName = document.querySelector('.coach-name');
  if (coachName) coachName.textContent = coach.name;
  
  const coachTitle = document.querySelector('.coach-title');
  if (coachTitle) coachTitle.textContent = coach.title;
  
  const coachAvatar = document.querySelector('.coach-avatar');
  if (coachAvatar) {
    coachAvatar.src = coach.image;
    coachAvatar.alt = `${coach.name} - ${coach.badge}`;
  }
  
  const coachBadge = document.querySelector('.coach-badge');
  if (coachBadge) coachBadge.textContent = coach.badge;
  
  // Обновить описание
  const coachDescription = document.querySelector('.coach-description');
  if (coachDescription) coachDescription.textContent = coach.description;
  
  // Обновить достижения
  const achievementsList = document.querySelector('.coach-achievements-list');
  if (achievementsList && coach.achievements) {
    achievementsList.innerHTML = coach.achievements
      .map(achievement => `<li>${achievement}</li>`)
      .join('');
  }
  
  // Обновить методику
  const methodology = document.querySelector('.coach-methodology');
  if (methodology && coach.methodology) {
    methodology.innerHTML = coach.methodology;
  }
  
  // Обновить ссылку на Telegram
  const telegramLink = document.querySelector('.coach-telegram-link');
  if (telegramLink && coach.telegram) {
    telegramLink.href = coach.telegram;
  }
  
  // Обновить Structured Data (JSON-LD)
  updateStructuredData(coach);
}

// Обновить JSON-LD структурированные данные
function updateStructuredData(coach) {
  // Person schema
  const personScript = document.querySelector('script[type="application/ld+json"]');
  if (personScript) {
    try {
      const schema = JSON.parse(personScript.textContent);
      schema.name = coach.name;
      schema.jobTitle = coach.badge;
      schema.description = coach.description;
      schema.image.url = `https://chessmint.ru${coach.image}`;
      schema.url = `https://chessmint.ru/coach?coach=${coach.id}`;
      
      if (coach.firstName) {
        schema.givenName = coach.firstName;
      }
      if (coach.lastName) {
        schema.familyName = coach.lastName;
      }
      
      personScript.textContent = JSON.stringify(schema, null, 2);
    } catch (e) {
      console.error('Error updating structured data:', e);
    }
  }
}

// Инициализация
async function initCoachPage() {
  await loadCoachesData();
  const coachId = getCoachIdFromURL();
  currentCoach = findCoachById(coachId);
  
  if (currentCoach) {
    updateMetaTags(currentCoach);
    updatePageContent(currentCoach);
  } else {
    console.error('Coach not found:', coachId);
  }
}

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCoachPage);
} else {
  initCoachPage();
}
```

---

### Шаг 3: Добавить data-атрибуты в HTML

В `coach.html` заменить статичный контент на элементы с data-атрибутами или классами:

```html
<!-- Вместо статичного текста -->
<h1 class="coach-name">Григорий Пономарев</h1>
<p class="coach-title">Мастер FIDE (FM), Чемпион России</p>
<img class="coach-avatar" src="/images/coaches/grisha.jpg" alt="...">
<div class="coach-badge">Мастер FIDE</div>
<p class="coach-description">...</p>
<ul class="coach-achievements-list">...</ul>
```

---

### Шаг 4: Обновить ссылки на странице тренеров

В `coaches.html` обновить ссылки:
```html
<a href="/coach?coach=grisha" class="trainer-link">Подробнее</a>
```

---

## 🔄 Альтернатива: Вариант 2 (Путь с slug)

Если хотите более SEO-friendly URLs (`/coach/grisha`), нужно:

### 1. Обновить backend роутинг

В `backend/app/main.py`:
```python
@app.get("/coach/{coach_slug}")
def serve_coach_page(coach_slug: str):
    # Всегда отдаем coach.html, slug обрабатывается в JS
    coach_path = WEB_DIR / "coach.html"
    if coach_path.is_file():
        return FileResponse(str(coach_path))
    return JSONResponse({"detail": "Not Found"}, status_code=404)
```

### 2. Обновить JavaScript

```javascript
function getCoachIdFromURL() {
  const path = window.location.pathname;
  const match = path.match(/\/coach\/([^\/]+)/);
  return match ? match[1] : 'grisha';
}
```

---

## 📋 Чеклист реализации

### Базовая версия (Query параметры):
- [ ] Создать `data/coaches.json` с данными тренеров
- [ ] Создать `scripts/coach.js` для динамической загрузки
- [ ] Добавить классы/data-атрибуты в `coach.html`
- [ ] Обновить ссылки в `coaches.html`
- [ ] Протестировать загрузку данных

### Продвинутая версия (Путь с slug):
- [ ] Настроить backend роутинг для `/coach/*`
- [ ] Обновить JavaScript для парсинга пути
- [ ] Обновить все внутренние ссылки
- [ ] Настроить редирект `/coach` → `/coach/grisha`

---

## 🎯 Рекомендация

**Начать с Варианта 1 (query параметры)**, потому что:
1. Быстрая реализация
2. Не требует изменений backend
3. Обратная совместимость
4. Легко переделать на Вариант 2 позже

Когда будет больше тренеров и важнее SEO, можно перейти на Вариант 2.

---

## 🔗 Обновление ссылок

После реализации нужно обновить:
- Ссылки в `coaches.html` → `/coach?coach={id}`
- Ссылки в `index.html` → `/coach?coach=grisha`
- Breadcrumbs на странице тренера
- Sitemap.xml
