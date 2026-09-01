// Coach page dynamic loading

// Данные тренеров
let coachesData = null;
let currentCoach = null;

function replaceTextList(container, items, createItem) {
  if (!Array.isArray(items)) {
    throw new Error('Coach list data must be an array');
  }

  const fragment = document.createDocumentFragment();
  items.forEach((item) => fragment.appendChild(createItem(String(item))));
  container.replaceChildren(fragment);
}

function renderMethodology(container, source) {
  const documentFragment = document.createDocumentFragment();
  const parsed = new DOMParser().parseFromString(String(source), 'text/html');
  const paragraphs = Array.from(parsed.body.querySelectorAll('p'));

  if (paragraphs.length === 0) {
    const paragraph = document.createElement('p');
    paragraph.className = 'about-coach-text';
    paragraph.textContent = parsed.body.textContent;
    documentFragment.appendChild(paragraph);
  } else {
    paragraphs.forEach((sourceParagraph) => {
      const paragraph = document.createElement('p');
      paragraph.className = 'about-coach-text';
      paragraph.textContent = sourceParagraph.textContent;
      documentFragment.appendChild(paragraph);
    });
  }

  container.replaceChildren(documentFragment);
}

/**
 * Загрузка данных тренеров из JSON
 */
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

/**
 * Получить ID тренера из URL пути
 * Например: /coach/grisha -> "grisha"
 */
function getCoachIdFromURL() {
  const path = window.location.pathname;
  const match = path.match(/\/coach\/([^\/]+)/);
  return match ? match[1] : 'grisha'; // По умолчанию grisha
}

/**
 * Найти тренера по ID или slug
 */
function findCoachById(id) {
  if (!coachesData || !coachesData.length) return null;
  const coach = coachesData.find(c => c.id === id || c.slug === id);
  return coach || coachesData[0]; // Если не найден, возвращаем первого
}

/**
 * Обновить мета-теги страницы
 */
function updateMetaTags(coach) {
  if (!coach) return;
  
  const baseUrl = 'https://chessmint.ru';
  const coachUrl = `${baseUrl}/coach/${coach.slug}`;
  
  // Title
  document.title = coach.meta?.title || `${coach.name} - ${coach.title} | ChessMint`;
  
  // Meta description
  const metaDesc = document.querySelector('meta[name="description"]');
  if (metaDesc) {
    metaDesc.content = coach.meta?.description || `${coach.name} - ${coach.title}. ${coach.description}`;
  }
  
  // Meta keywords
  const metaKeywords = document.querySelector('meta[name="keywords"]');
  if (metaKeywords && coach.meta?.keywords) {
    metaKeywords.content = coach.meta.keywords;
  }
  
  // Canonical URL
  const canonical = document.querySelector('link[rel="canonical"]');
  if (canonical) {
    canonical.href = coachUrl;
  }
  
  // Hreflang
  const hreflang = document.querySelector('link[rel="alternate"][hreflang="ru"]');
  if (hreflang) {
    hreflang.href = coachUrl;
  }
  
  // Open Graph
  updateOGTag('og:url', coachUrl);
  updateOGTag('og:title', coach.meta?.title || `${coach.name} - ${coach.title}`);
  updateOGTag('og:description', coach.meta?.description || coach.description);
  updateOGTag('og:image', `${baseUrl}${coach.image}`);
  
  // Profile tags
  updateOGTag('profile:first_name', coach.firstName);
  updateOGTag('profile:last_name', coach.lastName);
  
  // Twitter Card
  updateMetaTag('twitter:url', coachUrl);
  updateMetaTag('twitter:title', coach.meta?.title || `${coach.name} - ${coach.title}`);
  updateMetaTag('twitter:description', coach.meta?.description || coach.description);
  updateMetaTag('twitter:image', `${baseUrl}${coach.image}`);
}

/**
 * Обновить Open Graph тег
 */
function updateOGTag(property, content) {
  const tag = document.querySelector(`meta[property="${property}"]`);
  if (tag) {
    tag.content = content;
  } else {
    // Создать тег если его нет
    const meta = document.createElement('meta');
    meta.setAttribute('property', property);
    meta.content = content;
    document.head.appendChild(meta);
  }
}

/**
 * Обновить обычный meta тег
 */
function updateMetaTag(name, content) {
  const tag = document.querySelector(`meta[name="${name}"]`);
  if (tag) {
    tag.content = content;
  }
}

/**
 * Обновить контент страницы
 */
function updatePageContent(coach) {
  if (!coach) return;
  
  // Обновить хлебные крошки
  const breadcrumbName = document.querySelector('.breadcrumb-coach-name');
  if (breadcrumbName) {
    breadcrumbName.textContent = coach.name;
    // Обновить itemprop="name" в родительском li
    const breadcrumbLi = breadcrumbName.closest('li[itemprop="itemListElement"]');
    if (breadcrumbLi) {
      const nameSpan = breadcrumbLi.querySelector('span[itemprop="name"]');
      if (nameSpan) {
        nameSpan.textContent = coach.name;
      }
    }
  }
  
  // Обновить hero заголовок
  const heroHeading = document.getElementById('hero-heading');
  if (heroHeading) {
    heroHeading.textContent = `${coach.name} - ${coach.badge} | Шахматный тренер`;
  }
  
  // Обновить имя тренера
  const coachName = document.querySelector('.coach-name');
  if (coachName) {
    coachName.textContent = coach.name;
    coachName.setAttribute('itemprop', 'name');
  }
  
  // Обновить title
  const coachTitle = document.querySelector('.coach-title');
  if (coachTitle) {
    coachTitle.textContent = coach.title;
    coachTitle.setAttribute('itemprop', 'jobTitle');
  }
  
  // Обновить badge
  const coachBadge = document.querySelector('.coach-badge');
  if (!coachBadge) {
    // Если badge нет, нужно найти где он должен быть (в hero или sidebar)
    const sidebar = document.querySelector('.coach-sidebar');
    if (sidebar) {
      // Можно добавить badge если нужно
    }
  }
  
  // Обновить аватар
  const coachAvatar = document.querySelector('.coach-avatar-large img, .coach-avatar');
  if (coachAvatar) {
    coachAvatar.src = coach.image;
    coachAvatar.alt = `${coach.name} - ${coach.badge}`;
    coachAvatar.setAttribute('itemprop', 'image');
    // Обновить aria-label родителя
    const avatarParent = coachAvatar.closest('.coach-avatar-large, .coach-avatar-wrapper');
    if (avatarParent) {
      avatarParent.setAttribute('aria-label', `Аватар ${coach.name}`);
    }
  }
  
  // Обновить описание (если есть)
  const coachDescription = document.querySelector('.coach-description');
  if (coachDescription) {
    coachDescription.textContent = coach.description;
  }
  
  // Обновить достижения
  const achievementsList = document.querySelector('.achievements-list');
  if (achievementsList && coach.achievements) {
    replaceTextList(achievementsList, coach.achievements, (achievement) => {
      const listItem = document.createElement('li');
      listItem.className = 'achievement-text-item';
      listItem.setAttribute('itemprop', 'award');
      listItem.textContent = achievement;
      return listItem;
    });
  }
  
  // Обновить методику обучения
  const aboutContent = document.querySelector('.about-coach-content');
  if (aboutContent && coach.methodology) {
    renderMethodology(aboutContent, coach.methodology);
  }
  
  // Обновить "Для кого подходит"
  const levelsList = document.querySelector('.levels-list');
  if (levelsList && coach.forWhom) {
    replaceTextList(levelsList, coach.forWhom, (item) => {
      const listItem = document.createElement('li');
      listItem.className = 'level-item';

      const icon = document.createElement('i');
      icon.className = 'fas fa-check-circle';
      icon.setAttribute('aria-hidden', 'true');

      const text = document.createElement('span');
      text.textContent = item;
      listItem.append(icon, text);
      return listItem;
    });
  }
  
  // Обновить ссылку на Telegram
  const telegramLink = document.querySelector('.coach-telegram-link, a[href^="https://t.me"]');
  if (telegramLink && coach.telegram) {
    telegramLink.href = coach.telegram;
    telegramLink.setAttribute('itemprop', 'sameAs');
    // Обновить aria-label
    telegramLink.setAttribute('aria-label', `Связаться с ${coach.name} через Telegram`);
  }
  
  // Обновить Structured Data (JSON-LD)
  updateStructuredData(coach);
}

/**
 * Обновить JSON-LD структурированные данные
 */
function updateStructuredData(coach) {
  if (!coach) return;
  
  const baseUrl = 'https://chessmint.ru';
  const coachUrl = `${baseUrl}/coach/${coach.slug}`;
  
  // Person schema - найти первый script с Person типом
  const allScripts = document.querySelectorAll('script[type="application/ld+json"]');
  allScripts.forEach(personScript => {
    try {
      const schema = JSON.parse(personScript.textContent);
      if (schema['@type'] === 'Person') {
        schema.name = coach.name;
        schema.jobTitle = coach.badge;
        schema.description = coach.description || (schema.description || `${coach.name} - ${coach.title}. Опытный шахматный тренер, специализирующийся на персональном обучении шахматам онлайн.`);
        schema.url = coachUrl;
        if (!schema.image) {
          schema.image = {};
        }
        if (typeof schema.image === 'object' && !schema.image.url) {
          schema.image["@type"] = "ImageObject";
        }
        schema.image.url = `${baseUrl}${coach.image}`;
        if (!schema.image.width) schema.image.width = 280;
        if (!schema.image.height) schema.image.height = 280;
        
        if (coach.firstName) {
          schema.givenName = coach.firstName;
        }
        if (coach.lastName) {
          schema.familyName = coach.lastName;
        }
        if (coach.badge) {
          schema.honorificPrefix = coach.badge;
        }
        if (coach.title && coach.title.includes('FM')) {
          schema.honorificSuffix = 'FM';
        }
        
        // Обновить достижения
        if (coach.achievements) {
          schema.award = coach.achievements;
        }
        
        // Обновить ссылки
        if (coach.telegram) {
          schema.sameAs = [coach.telegram];
        }
        
        personScript.textContent = JSON.stringify(schema, null, 2);
      }
    } catch (e) {
      // Игнорируем ошибки парсинга других схем
    }
  });
  
  // Service schema - обновить отдельно
  allScripts.forEach(serviceScript => {
    try {
      const schema = JSON.parse(serviceScript.textContent);
      if (schema['@type'] === 'Service' && schema.provider) {
        schema.provider.name = coach.name;
        schema.provider.jobTitle = coach.badge;
        if (schema.offers) {
          schema.offers.url = coachUrl;
        }
        serviceScript.textContent = JSON.stringify(schema, null, 2);
      }
    } catch (e) {
      // Игнорируем ошибки парсинга
    }
  });
  
  // BreadcrumbList schema - обновить отдельно
  const breadcrumbScripts = document.querySelectorAll('script[type="application/ld+json"]');
  breadcrumbScripts.forEach(script => {
    try {
      const schema = JSON.parse(script.textContent);
      if (schema['@type'] === 'BreadcrumbList') {
        // Обновить ссылку на "Тренеры"
        if (schema.itemListElement && schema.itemListElement.length >= 2) {
          schema.itemListElement[1].name = 'Тренеры';
          schema.itemListElement[1].item = `${baseUrl}/coaches`;
          
          // Добавить третий элемент для имени тренера
          if (schema.itemListElement.length === 2) {
            schema.itemListElement.push({
              "@type": "ListItem",
              "position": 3,
              "name": coach.name,
              "item": coachUrl
            });
          } else if (schema.itemListElement.length >= 3) {
            // Обновить существующий третий элемент
            schema.itemListElement[2].name = coach.name;
            schema.itemListElement[2].item = coachUrl;
            schema.itemListElement[2].position = 3;
          }
          script.textContent = JSON.stringify(schema, null, 2);
        }
      }
    } catch (e) {
      // Игнорируем ошибки парсинга других схем
    }
  });
}

/**
 * Инициализация страницы тренера
 */
async function initCoachPage() {
  try {
    await loadCoachesData();
    const coachId = getCoachIdFromURL();
    currentCoach = findCoachById(coachId);
    
    if (currentCoach) {
      updateMetaTags(currentCoach);
      updatePageContent(currentCoach);
      
      // Обновить URL если нужен редирект (опционально)
      // Например, если открыли /coach без slug, можно редиректить
    } else {
      console.error('Coach not found:', coachId);
      // Можно показать ошибку или редирект на /coaches
    }
  } catch (error) {
    console.error('Error initializing coach page:', error);
  }
}

// Инициализация при загрузке DOM
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', initCoachPage);
} else {
  initCoachPage();
}
