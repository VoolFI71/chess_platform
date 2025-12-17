# 📄 Шаблоны страниц для SEO оптимизации

## 1. Страница "Шахматы с компьютером" (`/play-with-computer`)

### Структура файла: `backend/web/play-with-computer.html`

```html
<!DOCTYPE html>
<html lang="ru" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="theme-color" content="#1e293b">
    
    <!-- SEO Meta Tags -->
    <title>Шахматы с компьютером бесплатно онлайн - Играть с компьютером | ChessMint</title>
    <meta name="description" content="Играйте в шахматы с компьютером бесплатно онлайн на ChessMint. Выберите уровень сложности: от новичка до гроссмейстера. Тренируйтесь, улучшайте навыки, играйте без регистрации. Шахматы с компьютером для начинающих и профессионалов. Играть в шахматы с компьютером онлайн.">
    <meta name="keywords" content="шахматы с компьютером, шахматы с компьютером бесплатно, играть в шахматы с компьютером, шахматы играть с компьютером, шахматы с компьютером онлайн, шахматы с компьютером без регистрации, играть в шахматы с компьютером бесплатно, шахматы с компьютером для начинающих">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://chessmint.ru/play-with-computer">
    
    <!-- Open Graph -->
    <meta property="og:type" content="website">
    <meta property="og:url" content="https://chessmint.ru/play-with-computer">
    <meta property="og:title" content="Шахматы с компьютером бесплатно онлайн - ChessMint">
    <meta property="og:description" content="Играйте в шахматы с компьютером бесплатно онлайн. Выберите уровень сложности от новичка до гроссмейстера. Тренируйтесь без регистрации.">
    <meta property="og:image" content="https://chessmint.ru/favicon.svg">
    <meta property="og:locale" content="ru_RU">
    
    <!-- Structured Data - Game -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Game",
      "name": "Шахматы с компьютером онлайн",
      "description": "Играйте в шахматы с компьютером бесплатно. Выберите уровень сложности от новичка до гроссмейстера.",
      "url": "https://chessmint.ru/play-with-computer",
      "applicationCategory": "Game",
      "operatingSystem": "Web Browser",
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "RUB"
      },
      "gameItem": [
        {
          "@type": "Thing",
          "name": "Уровень новичок",
          "description": "ELO 800 - для начинающих игроков"
        },
        {
          "@type": "Thing",
          "name": "Уровень любитель",
          "description": "ELO 1200-1600 - для опытных игроков"
        },
        {
          "@type": "Thing",
          "name": "Уровень мастер",
          "description": "ELO 2000-2400 - для сильных игроков"
        },
        {
          "@type": "Thing",
          "name": "Уровень гроссмейстер",
          "description": "ELO 2800+ - максимальная сложность"
        }
      ]
    }
    </script>
    
    <!-- Structured Data - FAQPage -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "FAQPage",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "Можно ли играть в шахматы с компьютером бесплатно?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Да! На ChessMint вы можете играть в шахматы с компьютером абсолютно бесплатно и без регистрации. Доступны все уровни сложности от новичка до гроссмейстера."
          }
        },
        {
          "@type": "Question",
          "name": "Какие уровни сложности доступны?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Доступно 6 уровней сложности: Новичок (ELO 800), Любитель (ELO 1200), Опытный (ELO 1600), Мастер (ELO 2000), Гроссмейстер (ELO 2400), Супергроссмейстер (ELO 2800+)."
          }
        },
        {
          "@type": "Question",
          "name": "Нужна ли регистрация для игры с компьютером?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Нет, регистрация не требуется. Вы можете начать игру с компьютером сразу, без регистрации и без скачивания приложения."
          }
        }
      ]
    }
    </script>
    
    <!-- Подключение стилей и скриптов -->
    <link rel="stylesheet" href="/styles/pages/games/base.css">
    <link rel="stylesheet" href="/styles/components/chess-board.css">
</head>
<body>
    <!-- Header (использовать существующий компонент) -->
    <header id="main-header"></header>
    
    <!-- Breadcrumbs -->
    <nav aria-label="Хлебные крошки" class="breadcrumbs">
        <ol itemscope itemtype="https://schema.org/BreadcrumbList">
            <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                <a itemprop="item" href="/"><span itemprop="name">Главная</span></a>
                <meta itemprop="position" content="1">
            </li>
            <li itemprop="itemListElement" itemscope itemtype="https://schema.org/ListItem">
                <span itemprop="name">Играть с компьютером</span>
                <meta itemprop="position" content="2">
            </li>
        </ol>
    </nav>
    
    <!-- Основной контент -->
    <main>
        <section class="hero-section">
            <h1>Шахматы с компьютером бесплатно онлайн</h1>
            <p class="lead">Играйте в шахматы с компьютером бесплатно без регистрации. Выберите уровень сложности от новичка до гроссмейстера и улучшайте свои навыки.</p>
            
            <!-- Выбор уровня сложности -->
            <div class="difficulty-selector">
                <h2>Выберите уровень сложности:</h2>
                <div class="difficulty-options">
                    <button class="difficulty-btn" data-level="800">Новичок (ELO 800)</button>
                    <button class="difficulty-btn" data-level="1200">Любитель (ELO 1200)</button>
                    <button class="difficulty-btn" data-level="1600">Опытный (ELO 1600)</button>
                    <button class="difficulty-btn" data-level="2000">Мастер (ELO 2000)</button>
                    <button class="difficulty-btn" data-level="2400">Гроссмейстер (ELO 2400)</button>
                    <button class="difficulty-btn" data-level="2800">Супергроссмейстер (ELO 2800+)</button>
                </div>
            </div>
            
            <!-- Шахматная доска -->
            <div id="chess-board-container"></div>
        </section>
        
        <!-- Преимущества игры с компьютером -->
        <section class="benefits-section">
            <h2>Почему играть в шахматы с компьютером?</h2>
            <ul>
                <li>✅ <strong>Тренировка в любое время</strong> - играйте когда удобно, без ожидания соперника</li>
                <li>✅ <strong>Выбор уровня сложности</strong> - от новичка до гроссмейстера</li>
                <li>✅ <strong>Бесплатно и без регистрации</strong> - начните играть прямо сейчас</li>
                <li>✅ <strong>Анализ партий</strong> - изучайте свои ошибки и улучшайте игру</li>
                <li>✅ <strong>Подсказки для начинающих</strong> - учитесь во время игры</li>
            </ul>
        </section>
        
        <!-- FAQ секция -->
        <section class="faq-section">
            <h2>Часто задаваемые вопросы</h2>
            <div class="faq-list">
                <div class="faq-item">
                    <h3>Можно ли играть в шахматы с компьютером бесплатно?</h3>
                    <p>Да! На ChessMint вы можете играть в шахматы с компьютером абсолютно бесплатно и без регистрации. Доступны все уровни сложности от новичка до гроссмейстера.</p>
                </div>
                <div class="faq-item">
                    <h3>Какие уровни сложности доступны?</h3>
                    <p>Доступно 6 уровней сложности: Новичок (ELO 800), Любитель (ELO 1200), Опытный (ELO 1600), Мастер (ELO 2000), Гроссмейстер (ELO 2400), Супергроссмейстер (ELO 2800+).</p>
                </div>
                <div class="faq-item">
                    <h3>Нужна ли регистрация для игры с компьютером?</h3>
                    <p>Нет, регистрация не требуется. Вы можете начать игру с компьютером сразу, без регистрации и без скачивания приложения.</p>
                </div>
                <div class="faq-item">
                    <h3>Можно ли отменить ход при игре с компьютером?</h3>
                    <p>Да, при игре с компьютером вы можете отменить последний ход. Это помогает учиться и анализировать позиции.</p>
                </div>
                <div class="faq-item">
                    <h3>Есть ли подсказки для начинающих?</h3>
                    <p>Да, для начинающих доступны подсказки, которые показывают лучшие ходы в позиции. Это помогает учиться во время игры.</p>
                </div>
            </div>
        </section>
        
        <!-- Связанные страницы -->
        <section class="related-pages">
            <h2>Вам также может быть интересно:</h2>
            <ul>
                <li><a href="/games">Играть в шахматы с живыми игроками</a></li>
                <li><a href="/tasks">Решать шахматные задачи</a></li>
                <li><a href="/learn">Обучение шахматам для начинающих</a></li>
                <li><a href="/play-now">Играть без регистрации</a></li>
            </ul>
        </section>
    </main>
    
    <!-- Footer (использовать существующий компонент) -->
    <footer id="main-footer"></footer>
    
    <!-- Скрипты -->
    <script src="/scripts/games/games-core.js"></script>
    <script src="/scripts/games/games-api.js"></script>
</body>
</html>
```

---

## 2. Страница "Шахматы для начинающих" (`/learn`)

### Структура файла: `backend/web/learn.html`

```html
<!DOCTYPE html>
<html lang="ru" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- SEO Meta Tags -->
    <title>Шахматы для начинающих - Обучение шахматам с нуля | ChessMint</title>
    <meta name="description" content="Научитесь играть в шахматы с нуля на ChessMint. Бесплатные уроки для начинающих: правила шахмат, как ходят фигуры, основы тактики и стратегии. Интерактивное обучение шахматам онлайн. Шахматы для детей и взрослых.">
    <meta name="keywords" content="шахматы для начинающих, как научиться играть в шахматы, обучение шахматам, правила шахмат, шахматы с нуля, обучение шахматам онлайн, как играть в шахматы, шахматы для детей, основы шахмат">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://chessmint.ru/learn">
    
    <!-- Structured Data - HowTo -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "HowTo",
      "name": "Как научиться играть в шахматы",
      "description": "Пошаговое руководство по обучению шахматам для начинающих",
      "step": [
        {
          "@type": "HowToStep",
          "name": "Изучите правила шахмат",
          "text": "Начните с изучения правил игры: как ходят фигуры, что такое шах, мат и пат."
        },
        {
          "@type": "HowToStep",
          "name": "Изучите ходы фигур",
          "text": "Изучите как ходят все фигуры: пешка, ладья, конь, слон, ферзь, король."
        },
        {
          "@type": "HowToStep",
          "name": "Практикуйтесь",
          "text": "Начните играть с компьютером на низком уровне сложности и решайте простые задачи."
        }
      ]
    }
    </script>
    
    <!-- Structured Data - Course -->
    <script type="application/ld+json">
    {
      "@context": "https://schema.org",
      "@type": "Course",
      "name": "Обучение шахматам для начинающих",
      "description": "Бесплатный курс по обучению шахматам с нуля",
      "provider": {
        "@type": "Organization",
        "name": "ChessMint",
        "url": "https://chessmint.ru"
      },
      "offers": {
        "@type": "Offer",
        "price": "0",
        "priceCurrency": "RUB"
      }
    }
    </script>
</head>
<body>
    <header id="main-header"></header>
    
    <main>
        <section class="hero-section">
            <h1>Шахматы для начинающих - Обучение с нуля</h1>
            <p class="lead">Научитесь играть в шахматы бесплатно. Пошаговые уроки, интерактивные примеры и практические упражнения для начинающих.</p>
        </section>
        
        <!-- Уроки -->
        <section class="lessons-section">
            <h2>Уроки для начинающих</h2>
            
            <article class="lesson-card">
                <h3>Урок 1: Правила шахмат</h3>
                <p>Изучите основные правила игры в шахматы: цель игры, как расставлять фигуры, что такое шах, мат и пат.</p>
                <a href="/learn/rules" class="btn">Изучить правила</a>
            </article>
            
            <article class="lesson-card">
                <h3>Урок 2: Как ходят фигуры</h3>
                <p>Изучите как ходят все фигуры: пешка, ладья, конь, слон, ферзь, король. Интерактивные примеры.</p>
                <a href="/learn/pieces" class="btn">Изучить фигуры</a>
            </article>
            
            <article class="lesson-card">
                <h3>Урок 3: Основы тактики</h3>
                <p>Изучите основные тактические приемы: вилка, связка, двойной удар, отвлечение.</p>
                <a href="/learn/tactics" class="btn">Изучить тактику</a>
            </article>
            
            <article class="lesson-card">
                <h3>Урок 4: Практика</h3>
                <p>Начните практиковаться: играйте с компьютером и решайте простые задачи.</p>
                <a href="/play-with-computer" class="btn">Играть с компьютером</a>
                <a href="/tasks" class="btn">Решать задачи</a>
            </article>
        </section>
        
        <!-- FAQ -->
        <section class="faq-section">
            <h2>Часто задаваемые вопросы</h2>
            <div class="faq-list">
                <div class="faq-item">
                    <h3>С чего начать обучение шахматам?</h3>
                    <p>Начните с изучения правил игры и ходов фигур. Затем практикуйтесь, играя с компьютером на низком уровне и решая простые задачи.</p>
                </div>
                <div class="faq-item">
                    <h3>Сколько времени нужно, чтобы научиться играть в шахматы?</h3>
                    <p>Основы можно изучить за несколько часов. Чтобы играть на хорошем уровне, потребуется регулярная практика в течение нескольких месяцев.</p>
                </div>
                <div class="faq-item">
                    <h3>Можно ли научиться играть в шахматы самостоятельно?</h3>
                    <p>Да, с помощью наших уроков и практики вы можете научиться играть в шахматы самостоятельно. Начните с простых задач и игр с компьютером.</p>
                </div>
            </div>
        </section>
    </main>
    
    <footer id="main-footer"></footer>
</body>
</html>
```

---

## 3. Страница "Шахматы без регистрации" (`/play-now`)

### Структура файла: `backend/web/play-now.html`

```html
<!DOCTYPE html>
<html lang="ru" class="scroll-smooth">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    
    <!-- SEO Meta Tags -->
    <title>Шахматы без регистрации - Играть онлайн бесплатно | ChessMint</title>
    <meta name="description" content="Играйте в шахматы без регистрации на ChessMint. Начните партию за 1 клик, без регистрации и без скачивания. Онлайн шахматы бесплатно с живыми игроками или компьютером. Шахматы без регистрации для всех.">
    <meta name="keywords" content="шахматы без регистрации, шахматы онлайн без регистрации, играть в шахматы без регистрации, шахматы бесплатно без регистрации, онлайн шахматы без регистрации, играть шахматы без регистрации">
    <meta name="robots" content="index, follow">
    <link rel="canonical" href="https://chessmint.ru/play-now">
</head>
<body>
    <header id="main-header"></header>
    
    <main>
        <section class="hero-section">
            <h1>Играйте в шахматы без регистрации</h1>
            <p class="lead">Начните играть в шахматы прямо сейчас, без регистрации и без скачивания. Бесплатно и мгновенно.</p>
            
            <!-- Большая кнопка CTA -->
            <div class="cta-section">
                <a href="/games" class="btn btn-large btn-primary">Играть без регистрации</a>
                <p class="cta-note">Начните партию за 1 клик</p>
            </div>
        </section>
        
        <!-- Варианты игры -->
        <section class="game-options">
            <h2>Выберите как играть:</h2>
            <div class="options-grid">
                <div class="option-card">
                    <h3>С живыми игроками</h3>
                    <p>Играйте с реальными соперниками со всего мира</p>
                    <a href="/games" class="btn">Играть с людьми</a>
                </div>
                <div class="option-card">
                    <h3>С компьютером</h3>
                    <p>Тренируйтесь против компьютера любого уровня</p>
                    <a href="/play-with-computer" class="btn">Играть с компьютером</a>
                </div>
                <div class="option-card">
                    <h3>Решать задачи</h3>
                    <p>Улучшайте тактику, решая шахматные задачи</p>
                    <a href="/tasks" class="btn">Решать задачи</a>
                </div>
            </div>
        </section>
        
        <!-- FAQ -->
        <section class="faq-section">
            <h2>Часто задаваемые вопросы</h2>
            <div class="faq-list">
                <div class="faq-item">
                    <h3>Действительно ли можно играть без регистрации?</h3>
                    <p>Да! Вы можете играть в шахматы на ChessMint без регистрации. Просто нажмите кнопку "Играть" и начните партию.</p>
                </div>
                <div class="faq-item">
                    <h3>Что можно делать без регистрации?</h3>
                    <p>Без регистрации вы можете играть партии, решать задачи, играть с компьютером. Регистрация нужна только для сохранения статистики и участия в рейтинге.</p>
                </div>
                <div class="faq-item">
                    <h3>Нужно ли что-то скачивать?</h3>
                    <p>Нет, ничего скачивать не нужно. Все работает прямо в браузере, на любом устройстве.</p>
                </div>
            </div>
        </section>
    </main>
    
    <footer id="main-footer"></footer>
</body>
</html>
```

---

## 📝 Общие рекомендации

### Для всех новых страниц:

1. **Используйте существующие компоненты:**
   - Header: `<header id="main-header"></header>`
   - Footer: `<footer id="main-footer"></footer>`
   - Стили из существующих CSS файлов

2. **Добавьте в навигацию:**
   - Обновите `backend/web/scripts/mobile-menu.js`
   - Добавьте ссылки в header

3. **Обновите sitemap.xml:**
   ```xml
   <url>
       <loc>https://chessmint.ru/play-with-computer</loc>
       <lastmod>2025-12-14</lastmod>
       <changefreq>weekly</changefreq>
       <priority>0.8</priority>
   </url>
   ```

4. **Добавьте в robots.txt:**
   - Убедитесь, что новые страницы не заблокированы

5. **Проверьте Structured Data:**
   - Используйте [Google Rich Results Test](https://search.google.com/test/rich-results)

---

**Следующий шаг:** Начать с создания страницы `/play-with-computer.html`

