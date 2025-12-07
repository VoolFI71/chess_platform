// Populate cabinet with owned and locked courses

const usernameCache = new Map();
const pendingUsernameRequests = new Map();
// Кеш истории партий по username (чтобы не перезагружать при переключении вкладок)
const historyCache = new Map();
const historyState = {
  loading: false,
  loaded: false,
  items: [],
  error: null,
  pageSize: 20, // Размер страницы для пагинации
  currentPage: 0,
  hasMore: true,
  currentUsername: null, // Текущий username, для которого загружена история
  profileUserId: null, // ID пользователя, для которого загружается история (если смотрим чужой профиль)
};
let currentUser = null;
let currentPuzzleStats = null;
window.profileUserId = null; // ID пользователя, профиль которого просматривается (глобальная переменная для доступа из HTML)

async function loadPuzzlesProgress(userId = null) {
  try {
    // Если передан userId, загружаем статистику этого пользователя, иначе текущего
    const statsPath = userId ? `/api/puzzles/stats/${userId}` : '/api/puzzles/stats/me';
    
    // Для чужого профиля используем обычный fetch (без авторизации)
    // Для своего профиля используем apiFetch (с авторизацией)
    const res = userId 
      ? await fetch(statsPath)
      : (typeof window.apiFetch === 'function' ? await window.apiFetch(statsPath) : null);
    
    if (!res || !res.ok) {
      throw new Error('Failed to load puzzle stats');
    }
    currentPuzzleStats = await res.json();
  } catch (e) {
    console.error('Failed to load puzzle stats:', e);
    currentPuzzleStats = null;
  }

  const solved = currentPuzzleStats?.solved_count ?? 0;
  const failed = currentPuzzleStats?.failed_count ?? 0;
  const attempts = solved + failed;
  const accuracy = currentPuzzleStats
    ? Math.round((currentPuzzleStats.accuracy ?? 0) * 100)
    : 0;
  const rating = currentPuzzleStats?.puzzle_rating ?? 1200;
  const currentStreak = currentPuzzleStats?.current_streak ?? 0;
  const bestStreak = currentPuzzleStats?.best_streak ?? 0;

  const solvedEl = document.getElementById('puzzlesSolved');
  if (solvedEl) solvedEl.textContent = solved;

  const accEl = document.getElementById('puzzlesAccuracy');
  if (accEl) accEl.textContent = `${accuracy}%`;

  const ratingEl = document.getElementById('puzzlesRating');
  if (ratingEl) ratingEl.textContent = rating;

  const streakEl = document.getElementById('puzzlesStreak');
  if (streakEl) streakEl.textContent = `${currentStreak} / ${bestStreak}`;
  
  // Загружаем статистику по темам
  await loadPuzzleThemesStats(userId);
}

// Экспортируем функцию для использования в HTML
window.loadPuzzleThemesStats = loadPuzzleThemesStats;

// Загрузка статистики по темам задач
async function loadPuzzleThemesStats(userId = null) {
  try {
    const themesPath = userId ? `/api/puzzles/stats/${userId}/themes` : '/api/puzzles/stats/me/themes';
    
    const res = userId 
      ? await fetch(themesPath)
      : (typeof window.apiFetch === 'function' ? await window.apiFetch(themesPath) : null);
    
    if (!res || !res.ok) {
      throw new Error('Failed to load theme stats');
    }
    
    const data = await res.json();
    renderPuzzleThemesChart(data.themes || []);
    renderPuzzleThemesList(data.themes || []);
  } catch (e) {
    console.error('Failed to load puzzle theme stats:', e);
    const container = document.getElementById('puzzleThemesList');
    if (container) {
      container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Не удалось загрузить статистику по категориям</div>';
    }
  }
}

// Отображение графика прогресса по темам
function renderPuzzleThemesChart(themes) {
  if (typeof Chart === 'undefined' || !themes || themes.length === 0) {
    return;
  }
  
  const ctx = document.getElementById('puzzleThemesChart')?.getContext('2d');
  if (!ctx) return;
  
  const isDark = document.body.classList.contains('dark');
  const textColor = isDark ? '#a0a0c0' : '#64748b';
  const gridColor = isDark ? '#2a2a4a' : '#e2e8f0';
  const tooltipBg = isDark ? '#1e1e3f' : '#ffffff';
  const tooltipBorder = isDark ? '#2a2a4a' : '#e2e8f0';
  
  // Уничтожаем существующий график, если есть
  const existingChart = Chart.getChart('puzzleThemesChart');
  if (existingChart) existingChart.destroy();
  
  // Берем топ-10 тем
  const topThemes = themes.slice(0, 10);
  
  new Chart(ctx, {
    type: 'bar',
    data: {
      labels: topThemes.map(t => t.theme),
      datasets: [
        {
          label: 'Решено',
          data: topThemes.map(t => t.solved),
          backgroundColor: '#10b981',
          borderRadius: 8,
          borderSkipped: false
        },
        {
          label: 'Не решено',
          data: topThemes.map(t => t.failed),
          backgroundColor: '#ef4444',
          borderRadius: 8,
          borderSkipped: false
        }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: {
        legend: {
          position: 'top',
          labels: {
            color: textColor,
            padding: 15,
            font: { size: 14 },
            usePointStyle: true
          }
        },
        tooltip: {
          backgroundColor: tooltipBg,
          titleColor: isDark ? '#ffffff' : '#0f172a',
          bodyColor: textColor,
          borderColor: tooltipBorder,
          borderWidth: 1,
          callbacks: {
            afterLabel: function(context) {
              const theme = themes[context.dataIndex];
              if (theme) {
                return `Точность: ${theme.accuracy}%`;
              }
              return '';
            }
          }
        }
      },
      scales: {
        y: {
          beginAtZero: true,
          grid: { color: gridColor },
          ticks: { color: textColor, stepSize: 1 }
        },
        x: {
          grid: { display: false },
          ticks: { color: textColor }
        }
      }
    }
  });
}

// Отображение списка категорий
function renderPuzzleThemesList(themes) {
  const container = document.getElementById('puzzleThemesList');
  if (!container) return;
  
  if (!themes || themes.length === 0) {
    container.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--text-secondary);">Нет данных по категориям</div>';
    return;
  }
  
  container.innerHTML = '';
  
  themes.forEach(theme => {
    const themeCard = document.createElement('div');
    themeCard.className = 'theme-stat-card';
    
    const progressPercent = theme.total > 0 ? Math.round((theme.solved / theme.total) * 100) : 0;
    
    themeCard.innerHTML = `
      <div class="theme-stat-header">
        <div class="theme-stat-name">${theme.theme}</div>
        <div class="theme-stat-accuracy">${theme.accuracy}%</div>
      </div>
      <div class="theme-stat-progress">
        <div class="progress-bar-wrapper">
          <div class="progress-bar-fill" style="width: ${progressPercent}%"></div>
        </div>
        <div class="theme-stat-numbers">
          <span>${theme.solved} / ${theme.total}</span>
        </div>
      </div>
    `;
    
    container.appendChild(themeCard);
  });
}

function createCourseCard(course, owned) {
  const card = document.createElement('div');
  card.className = 'course-card';

  const header = document.createElement('div');
  header.className = 'course-header';

  const info = document.createElement('div');
  info.className = 'course-info';

  const title = document.createElement('div');
  title.className = 'course-title';
  const icon = document.createElement('div');
  icon.className = 'course-icon';
  const iconElement = document.createElement('i');
  iconElement.className = 'fas fa-chess-pawn';
  icon.appendChild(iconElement);
  const span = document.createElement('span');
  span.textContent = course.title || course.slug;
  title.appendChild(icon);
  title.appendChild(span);

  const desc = document.createElement('p');
  desc.className = 'course-description';
  desc.textContent = course.description || '';

  info.appendChild(title);
  info.appendChild(desc);

  const meta = document.createElement('div');
  meta.className = 'course-meta';
  const pill = document.createElement('span');
  pill.className = 'badge-pill';
  pill.textContent = owned ? 'Доступ открыт' : 'Недоступно';
  meta.appendChild(pill);
  const chevron = document.createElement('i');
  chevron.className = 'fas fa-chevron-down expand-icon';
  meta.appendChild(chevron);

  header.appendChild(info);
  header.appendChild(meta);

  const body = document.createElement('div');
  body.className = 'course-body';
  const content = document.createElement('div');
  content.className = 'course-content';
  if (owned) {
    const btn = document.createElement('button');
    btn.className = 'btn btn-primary';
    btn.textContent = 'Открыть курс';
    btn.style.marginTop = '1rem';
    btn.onclick = () => {
      window.location.href = `/course/${course.id}`;
    };
    content.appendChild(btn);
  } else {
    const lock = document.createElement('div');
    lock.style.color = 'var(--muted)';
    lock.style.display = 'flex';
    lock.style.alignItems = 'center';
    lock.style.gap = '0.5rem';
    const lockIcon = document.createElement('i');
    lockIcon.className = 'fas fa-lock';
    lock.appendChild(lockIcon);
    const lockText = document.createTextNode(' Доступ отсутствует');
    lock.appendChild(lockText);
    const btn = document.createElement('button');
    btn.className = 'btn btn-outline';
    btn.style.marginTop = '1rem';
    btn.textContent = 'Перейти к покупке';
    btn.onclick = () => window.location.href = '/#courses';
    content.appendChild(lock);
    content.appendChild(btn);
  }
  body.appendChild(content);

  card.appendChild(header);
  card.appendChild(body);

  header.onclick = () => card.classList.toggle('expanded');

  return card;
}

function renderEmptyState(container, text) {
  const wrap = document.createElement('div');
  wrap.style.color = 'var(--muted-foreground)';
  wrap.style.padding = '1rem 0';
  wrap.textContent = text;
  container.appendChild(wrap);
}

const translateStatus = (status) =>
  ({
    CREATED: 'Ожидает соперника',
    ACTIVE: 'Идёт партия',
    FINISHED: 'Завершена',
    PAUSED: 'Пауза',
  }[status] || 'Неизвестно');

const describeTermination = (reason) =>
  ({
    CHECKMATE: 'Мат',
    RESIGNATION: 'Сдача',
    TIMEOUT: 'По времени',
  }[reason] || null);

const describeTimeControl = (settings) => {
  if (!settings) return 'Без контроля';
  // Парсим time_control если это строка JSON
  let tc = settings;
  if (typeof settings === 'string') {
    try {
      tc = JSON.parse(settings);
    } catch {
      return 'Без контроля';
    }
  }
  if (!tc || typeof tc !== 'object') return 'Без контроля';
  const initialMs = Number(tc.initial_ms ?? 0);
  const incrementMs = Number(tc.increment_ms ?? 0);
  const minutes = Math.round(initialMs / 60000);
  const increment = Math.round(incrementMs / 1000);
  const minutesLabel = minutes > 0 ? `${minutes} мин` : `${Math.max(Math.round(initialMs / 1000), 0)} с`;
  const incrementLabel = increment > 0 ? ` +${increment} с` : '';
  return `${minutesLabel}${incrementLabel}`;
};

const formatDate = (value) => {
  if (!value) return 'Дата неизвестна';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Дата неизвестна';
  return date.toLocaleString('ru-RU', {
    day: 'numeric',
    month: 'long',
    hour: '2-digit',
    minute: '2-digit',
  });
};

const usernameFromCache = (id) => {
  if (id === null || id === undefined) return null;
  const key = Number(id);
  return usernameCache.has(key) ? usernameCache.get(key) : null;
};

async function fetchUsername(id) {
  if (id === null || id === undefined) return null;
  const key = Number(id);
  if (usernameCache.has(key)) return usernameCache.get(key);
  if (pendingUsernameRequests.has(key)) return pendingUsernameRequests.get(key);

  const request = (async () => {
    try {
      const res = await fetch(`/api/users/${encodeURIComponent(key)}`);
      if (!res.ok) throw new Error('Failed to load user');
      const data = await res.json();
      const username = data?.username || data?.display_name || null;
      usernameCache.set(key, username);
      return username;
    } catch {
      usernameCache.set(key, null);
      return null;
    } finally {
      pendingUsernameRequests.delete(key);
    }
  })();

  pendingUsernameRequests.set(key, request);
  return request;
}

async function warmUsernamesForGames(games) {
  const ids = new Set();
  games.forEach((game) => {
    if (!game) return;
    if (game.white_id !== null && game.white_id !== undefined) ids.add(Number(game.white_id));
    if (game.black_id !== null && game.black_id !== undefined) ids.add(Number(game.black_id));
  });
  if (!ids.size) return;
  await Promise.all(Array.from(ids).map((id) => fetchUsername(id)));
}

const playerLabel = (id) => {
  if (id === null || id === undefined) return 'Неизвестно';
  if (currentUser && currentUser.id === id) {
    return currentUser.username ? `Вы (${currentUser.username})` : 'Вы';
  }
  const cached = usernameFromCache(id);
  if (cached) return cached;
  return `ID ${id}`;
};

const getPlayerColor = (game) => {
  // Используем profileUserId если смотрим чужой профиль, иначе currentUser.id
  const userId = historyState.profileUserId || (currentUser ? currentUser.id : null);
  if (!userId) return null;
  if (game.white_id === userId) return 'white';
  if (game.black_id === userId) return 'black';
  return null;
};

const getOpponentId = (game) => {
  const color = getPlayerColor(game);
  if (color === 'white') return game.black_id;
  if (color === 'black') return game.white_id;
  return null;
};

const describeResult = (game) => {
  // Если партия не завершена, показываем соответствующий статус
  if (game.status !== 'FINISHED') {
    return { label: 'Партия не завершена', className: 'pending' };
  }
  
  // Если нет результата, но статус FINISHED, показываем как завершенную
  if (!game.result) {
    return { label: 'Завершена', className: 'draw' };
  }
  
  const color = getPlayerColor(game);
  // Если не можем определить цвет (пользователь не участвовал), показываем общий результат
  if (!color) {
    if (game.result === '1/2-1/2') {
      return { label: 'Ничья', className: 'draw' };
    }
    return { label: 'Завершена', className: 'draw' };
  }
  
  if (game.result === '1/2-1/2') {
    return { label: 'Ничья', className: 'draw' };
  }
  const isWhiteWin = game.result === '1-0';
  const didWin = (isWhiteWin && color === 'white') || (!isWhiteWin && color === 'black');
  return {
    label: didWin ? 'Победа' : 'Поражение',
    className: didWin ? 'win' : 'loss',
  };
};

// Экспортируем функцию загрузки прогресса по задачам в глобальный scope
window.loadPuzzlesProgress = loadPuzzlesProgress;
function renderHistoryAuthPrompt() {
  const container = document.getElementById('matchHistoryList');
  if (!container) return;
  container.textContent = '';
  const emptyDiv = document.createElement('div');
  emptyDiv.className = 'history-empty';
  const messageDiv = document.createElement('div');
  messageDiv.style.marginBottom = '0.75rem';
  messageDiv.textContent = 'Войдите, чтобы просматривать историю своих партий.';
  const loginBtn = document.createElement('button');
  loginBtn.className = 'btn btn-primary';
  loginBtn.type = 'button';
  loginBtn.textContent = 'Войти';
  loginBtn.onclick = () => {
    if (window.showLoginModal) {
      window.showLoginModal();
    }
  };
  emptyDiv.appendChild(messageDiv);
  emptyDiv.appendChild(loginBtn);
  container.appendChild(emptyDiv);
}

function renderMatchHistory() {
  const container = document.getElementById('matchHistoryList');
  if (!container) return;

  if (!historyState.items.length) {
    container.textContent = '';
    const emptyDiv = document.createElement('div');
    emptyDiv.className = 'history-empty';
    const icon = document.createElement('i');
    icon.className = 'fas fa-chess-knight';
    icon.style.marginRight = '0.5rem';
    emptyDiv.appendChild(icon);
    emptyDiv.appendChild(document.createTextNode('У вас пока нет сыгранных партий'));
    container.appendChild(emptyDiv);
    return;
  }

  container.innerHTML = '';

  historyState.items.forEach((game) => {
    const card = document.createElement('div');
    card.className = 'activity-item';

    const result = describeResult(game);
    const color = getPlayerColor(game);
    const opponent = getOpponentId(game);
    const matchDate = formatDate(game.finished_at || game.started_at || game.created_at);
    const timeControl = describeTimeControl(game.time_control);
    
    // Определяем стиль иконки и цвета на основе результата
    let iconClass = 'fas fa-minus';
    let iconStyle = 'warning';
    let ratingChange = '';
    
    if (result.className === 'win') {
      iconClass = 'fas fa-check';
      iconStyle = 'success';
      // TODO: Получить изменение рейтинга из API
      ratingChange = '+15';
    } else if (result.className === 'loss') {
      iconClass = 'fas fa-times';
      iconStyle = 'danger';
      ratingChange = '-12';
    } else {
      ratingChange = '0';
    }
    
    // Создаем иконку
    const iconDiv = document.createElement('div');
    iconDiv.className = `activity-icon ${iconStyle}`;
    const icon = document.createElement('i');
    icon.className = iconClass;
    iconDiv.appendChild(icon);
    
    // Создаем контент
    const contentDiv = document.createElement('div');
    contentDiv.className = 'activity-content';
    
    // Текст активности
    const textDiv = document.createElement('div');
    textDiv.className = 'activity-text';
    const resultText = document.createElement('strong');
    resultText.textContent = result.label;
    const againstText = document.createTextNode(' ');
    const againstStrong = document.createElement('strong');
    againstStrong.textContent = `@${playerLabel(opponent)}`;
    if (result.className === 'win') {
      textDiv.appendChild(resultText);
      textDiv.appendChild(document.createTextNode(' против '));
      textDiv.appendChild(againstStrong);
    } else if (result.className === 'loss') {
      textDiv.appendChild(resultText);
      textDiv.appendChild(document.createTextNode(' от '));
      textDiv.appendChild(againstStrong);
    } else {
      textDiv.appendChild(resultText);
      textDiv.appendChild(document.createTextNode(' с '));
      textDiv.appendChild(againstStrong);
    }
    
    // Время активности
    const timeDiv = document.createElement('div');
    timeDiv.className = 'activity-time';
    timeDiv.innerHTML = `${timeControl} | Рейтинг: <span style="color: var(--${iconStyle === 'success' ? 'success' : iconStyle === 'danger' ? 'danger' : 'warning'}); font-weight: 600;">${ratingChange}</span> | ${matchDate}`;
    
    contentDiv.appendChild(textDiv);
    contentDiv.appendChild(timeDiv);
    
    card.appendChild(iconDiv);
    card.appendChild(contentDiv);
    
    // Добавляем клик для просмотра партии
    card.style.cursor = 'pointer';
    card.onclick = () => {
      window.location.href = `/match/${game.id}`;
    };
    
    container.appendChild(card);
  });
  
  // Добавляем кнопку "Загрузить еще" если есть еще игры
  if (historyState.hasMore && !historyState.loading) {
    const loadMoreBtn = document.createElement('div');
    loadMoreBtn.style.cssText = 'text-align: center; margin-top: 2rem;';
    const loadMoreButton = document.createElement('button');
    loadMoreButton.className = 'btn btn-primary';
    loadMoreButton.type = 'button';
    loadMoreButton.onclick = () => {
      if (window.loadMoreHistory) {
        window.loadMoreHistory();
      }
    };
    const loadMoreIcon = document.createElement('i');
    loadMoreIcon.className = 'fas fa-chevron-down';
    loadMoreButton.appendChild(loadMoreIcon);
    loadMoreButton.appendChild(document.createTextNode(' Загрузить еще'));
    loadMoreBtn.appendChild(loadMoreButton);
    container.appendChild(loadMoreBtn);
  }
  
  // Показываем индикатор загрузки при подгрузке
  if (historyState.loading && historyState.items.length > 0) {
    const loadingIndicator = document.createElement('div');
    loadingIndicator.style.cssText = 'text-align: center; margin-top: 1rem; color: var(--muted-foreground);';
    const spinnerIcon = document.createElement('i');
    spinnerIcon.className = 'fas fa-spinner fa-spin';
    spinnerIcon.style.marginRight = '0.5rem';
    loadingIndicator.appendChild(spinnerIcon);
    loadingIndicator.appendChild(document.createTextNode('Загружаем еще партии...'));
    container.appendChild(loadingIndicator);
  }
}

async function loadMatchHistory(username = null, loadMore = false) {
  const container = document.getElementById('matchHistoryList');
  if (!container) return;

  // Определяем username для запроса
  let targetUsername = username;
  let profileUserId = null;
  
  if (!targetUsername) {
    // Пытаемся получить username из URL (/profile/{username})
    const pathMatch = window.location.pathname.match(/^\/profile\/(.+)$/);
    if (pathMatch) {
      targetUsername = decodeURIComponent(pathMatch[1]);
      // Загружаем ID пользователя для правильного определения результата
      try {
        const userRes = await fetch(`/api/users/${encodeURIComponent(targetUsername)}`);
        if (userRes.ok) {
          const profileUser = await userRes.json();
          profileUserId = profileUser.id;
        } else {
          // Если пользователь не найден, показываем ошибку
          container.textContent = '';
          const errorDiv = document.createElement('div');
          errorDiv.className = 'history-empty error';
          const errorIcon = document.createElement('i');
          errorIcon.className = 'fas fa-exclamation-triangle';
          errorIcon.style.marginRight = '0.5rem';
          errorDiv.appendChild(errorIcon);
          errorDiv.appendChild(document.createTextNode('Пользователь не найден'));
          container.appendChild(errorDiv);
          return;
        }
      } catch (e) {
        console.error('Failed to load profile user:', e);
        container.textContent = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'history-empty error';
        const errorIcon = document.createElement('i');
        errorIcon.className = 'fas fa-exclamation-triangle';
        errorIcon.style.marginRight = '0.5rem';
        errorDiv.appendChild(errorIcon);
        errorDiv.appendChild(document.createTextNode('Не удалось загрузить данные пользователя. Попробуйте обновить страницу.'));
        container.appendChild(errorDiv);
        return;
      }
    } else if (currentUser && currentUser.username) {
      // Если это текущий пользователь, используем 'me'
      targetUsername = 'me';
      profileUserId = currentUser.id;
    } else {
      // Если нет авторизации и нет username в URL, показываем сообщение
      container.textContent = '';
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'history-empty';
      const infoIcon = document.createElement('i');
      infoIcon.className = 'fas fa-info-circle';
      infoIcon.style.marginRight = '0.5rem';
      emptyDiv.appendChild(infoIcon);
      emptyDiv.appendChild(document.createTextNode('Войдите в аккаунт или укажите пользователя в URL для просмотра истории партий'));
      container.appendChild(emptyDiv);
      return;
    }
  } else if (targetUsername !== 'me') {
    // Если передан username, загружаем его ID
    try {
      const userRes = await fetch(`/api/users/${encodeURIComponent(targetUsername)}`);
      if (userRes.ok) {
        const profileUser = await userRes.json();
        profileUserId = profileUser.id;
      } else {
        // Если пользователь не найден, показываем ошибку
        container.textContent = '';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'history-empty error';
        const errorIcon = document.createElement('i');
        errorIcon.className = 'fas fa-exclamation-triangle';
        errorIcon.style.marginRight = '0.5rem';
        errorDiv.appendChild(errorIcon);
        errorDiv.appendChild(document.createTextNode('Пользователь не найден'));
        container.appendChild(errorDiv);
        return;
      }
    } catch (e) {
      console.error('Failed to load profile user:', e);
      container.textContent = '';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'history-empty error';
      const errorIcon = document.createElement('i');
      errorIcon.className = 'fas fa-exclamation-triangle';
      errorIcon.style.marginRight = '0.5rem';
      errorDiv.appendChild(errorIcon);
      errorDiv.appendChild(document.createTextNode('Не удалось загрузить данные пользователя. Попробуйте обновить страницу.'));
      container.appendChild(errorDiv);
      return;
    }
  } else {
    // Это 'me', используем currentUser.id
    profileUserId = currentUser ? currentUser.id : null;
  }
  
  // Сохраняем profileUserId в historyState
  historyState.profileUserId = profileUserId;

  // Проверяем кеш - если данные уже загружены для этого пользователя и не запрашивается "загрузить еще"
  if (!loadMore && historyCache.has(targetUsername)) {
    const cached = historyCache.get(targetUsername);
    historyState.items = cached.items;
    historyState.currentPage = cached.currentPage;
    historyState.hasMore = cached.hasMore;
    historyState.currentUsername = targetUsername;
    historyState.profileUserId = profileUserId; // Обновляем profileUserId
    historyState.loaded = true;
    // Убеждаемся, что имена пользователей загружены
    await warmUsernamesForGames(cached.items);
    renderMatchHistory();
    return;
  }

  // Если загружаем еще, используем текущее состояние
  if (loadMore && historyState.currentUsername === targetUsername) {
    historyState.currentPage += 1;
  } else {
    // Новая загрузка - сбрасываем состояние
    historyState.currentPage = 0;
    historyState.items = [];
    historyState.currentUsername = targetUsername;
  }

  historyState.loading = true;
  historyState.error = null;
  
  if (!loadMore) {
    container.textContent = '';
    const loadingDiv = document.createElement('div');
    loadingDiv.className = 'history-empty';
    const spinnerIcon = document.createElement('i');
    spinnerIcon.className = 'fas fa-spinner fa-spin';
    spinnerIcon.style.marginRight = '0.5rem';
    loadingDiv.appendChild(spinnerIcon);
    loadingDiv.appendChild(document.createTextNode('Загружаем историю партий...'));
    container.appendChild(loadingDiv);
  }

  try {
    // Проверяем наличие apiFetch
    if (typeof window.apiFetch !== 'function') {
      throw new Error('apiFetch не доступен. Убедитесь, что auth.js загружен.');
    }
    
    // Загружаем только завершенные игры (FINISHED) для конкретного пользователя с пагинацией
    const userParam = targetUsername === 'me' ? 'me' : encodeURIComponent(targetUsername);
    const offset = historyState.currentPage * historyState.pageSize;
    const limit = historyState.pageSize;
    const res = await window.apiFetch(`/api/games/?user_id=${userParam}&status=FINISHED&limit=${limit}&offset=${offset}`);
    if (!res.ok) throw new Error(await res.text());
    const newGames = await res.json();
    
    // API уже фильтрует по FINISHED и возвращает отсортированные данные
    if (loadMore) {
      // Добавляем к существующим играм
      historyState.items = [...historyState.items, ...newGames];
    } else {
      // Новая загрузка
      historyState.items = newGames;
    }
    
    // Проверяем, есть ли еще игры для загрузки
    // Если вернулось меньше limit, значит больше нет данных
    historyState.hasMore = newGames.length >= limit;
    
    // Сохраняем в кеш
    historyCache.set(targetUsername, {
      items: [...historyState.items],
      currentPage: historyState.currentPage,
      hasMore: historyState.hasMore,
      profileUserId: profileUserId, // Сохраняем profileUserId в кеш
    });
    
    historyState.loaded = true;
    await warmUsernamesForGames(newGames);
    // Перерендерим после загрузки имен пользователей
    renderMatchHistory();
  } catch (error) {
    console.error('Failed to load match history:', error);
    historyState.error = error;
    if (!loadMore) {
      container.textContent = '';
      const errorDiv = document.createElement('div');
      errorDiv.className = 'history-empty error';
      const errorMessage = document.createElement('div');
      errorMessage.textContent = 'Не удалось загрузить историю партий';
      const retryBtn = document.createElement('button');
      retryBtn.className = 'btn btn-primary';
      retryBtn.style.marginTop = '1rem';
      retryBtn.type = 'button';
      retryBtn.textContent = 'Попробовать снова';
      retryBtn.onclick = () => {
        if (window.ensureMatchHistoryLoaded) {
          window.ensureMatchHistoryLoaded(true);
        }
      };
      errorDiv.appendChild(errorMessage);
      errorDiv.appendChild(retryBtn);
      container.appendChild(errorDiv);
    }
  } finally {
    historyState.loading = false;
  }
}

async function ensureMatchHistoryLoaded(force = false, username = null) {
  // Определяем username
  let targetUsername = username;
  if (!targetUsername) {
    const pathMatch = window.location.pathname.match(/^\/profile\/(.+)$/);
    if (pathMatch) {
      targetUsername = decodeURIComponent(pathMatch[1]);
    } else if (currentUser && currentUser.username) {
      targetUsername = 'me';
    }
  }
  
  if (force) {
    // Принудительная перезагрузка - очищаем кеш
    if (targetUsername) {
      historyCache.delete(targetUsername);
    }
    historyState.loaded = false;
    historyState.items = [];
    historyState.currentPage = 0;
  }
  
  // Если уже загружено для этого пользователя и не требуется принудительная перезагрузка
  if (!force && targetUsername && historyCache.has(targetUsername)) {
    const cached = historyCache.get(targetUsername);
    historyState.items = cached.items;
    historyState.currentPage = cached.currentPage;
    historyState.hasMore = cached.hasMore;
    historyState.currentUsername = targetUsername;
    historyState.loaded = true;
    renderMatchHistory();
    return;
  }
  
  if (historyState.loading) return;
  await loadMatchHistory(targetUsername, false);
}

async function loadMoreHistory() {
  if (historyState.loading || !historyState.hasMore) return;
  await loadMatchHistory(historyState.currentUsername, true);
}

window.ensureMatchHistoryLoaded = ensureMatchHistoryLoaded;
window.loadMoreHistory = loadMoreHistory;
window.copyMatchLink = function copyMatchLink(gameId) {
  const url = `${window.location.origin || ''}/match/${gameId}`;
  if (!navigator.clipboard) {
    window.prompt('Скопируйте ссылку', url);
    return;
  }
  navigator.clipboard
    .writeText(url)
    .then(() => {
      alert('Ссылка скопирована');
    })
    .catch(() => {
      window.prompt('Скопируйте ссылку', url);
    });
};

// ==================== Функции для работы с друзьями ====================

let friendshipState = {
  profileUserId: null,
  friendship: null,
  loading: false,
};

async function checkFriendshipStatus(userId) {
  if (!userId || !window.apiFetch) return null;
  
  try {
    const res = await window.apiFetch(`/api/friendships/status/${userId}`);
    if (res.ok) {
      const data = await res.json();
      return data; // Может быть null если дружбы нет
    } else if (res.status === 404) {
      return null; // Дружбы нет
    } else if (res.status === 401 || res.status === 403) {
      // Не авторизован или нет доступа - не показываем кнопку
      return null;
    }
    return null;
  } catch (e) {
    console.error('Failed to check friendship status:', e);
    return null;
  }
}

async function sendFriendRequest(userId) {
  if (!userId || !window.apiFetch) return false;
  
  try {
    const res = await window.apiFetch('/api/friendships/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ addressee_id: userId }),
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to send friend request:', e);
    return false;
  }
}

async function deleteFriendship(friendshipId) {
  if (!friendshipId || !window.apiFetch) return false;
  
  try {
    const res = await window.apiFetch(`/api/friendships/${friendshipId}`, {
      method: 'DELETE',
    });
    return res.ok || res.status === 204;
  } catch (e) {
    console.error('Failed to delete friendship:', e);
    return false;
  }
}

function updateFriendshipButton() {
  const container = document.getElementById('friendshipButtonContainer');
  const button = document.getElementById('friendshipButton');
  const buttonText = document.getElementById('friendshipButtonText');
  
  if (!container || !button || !buttonText) return;
  
  if (friendshipState.loading) {
    button.disabled = true;
    buttonText.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Загрузка...';
    return;
  }
  
  button.disabled = false;
  
  if (!friendshipState.friendship) {
    // Нет дружбы - показываем "Добавить в друзья"
    button.className = 'btn btn-primary';
    buttonText.innerHTML = '<i class="fas fa-user-plus"></i> Добавить в друзья';
  } else if (friendshipState.friendship.status === 'pending') {
    // Запрос отправлен, но не принят
    if (friendshipState.friendship.requester_id === currentUser?.id) {
      // Мы отправили запрос
      button.className = 'btn btn-outline';
      buttonText.innerHTML = '<i class="fas fa-clock"></i> Запрос отправлен';
      button.disabled = true;
    } else {
      // Нам отправили запрос (не должно быть видно на странице другого пользователя)
      button.className = 'btn btn-primary';
      buttonText.innerHTML = '<i class="fas fa-user-plus"></i> Добавить в друзья';
    }
  } else if (friendshipState.friendship.status === 'accepted') {
    // Друзья - показываем "Удалить из друзей"
    button.className = 'btn btn-outline';
    buttonText.innerHTML = '<i class="fas fa-user-minus"></i> Удалить из друзей';
  } else {
    // declined или другой статус
    button.className = 'btn btn-primary';
    buttonText.innerHTML = '<i class="fas fa-user-plus"></i> Добавить в друзья';
  }
}

async function handleFriendshipButtonClick() {
  if (friendshipState.loading || !friendshipState.profileUserId) return;
  
  friendshipState.loading = true;
  updateFriendshipButton();
  
  try {
    if (!friendshipState.friendship) {
      // Отправляем запрос на дружбу
      const success = await sendFriendRequest(friendshipState.profileUserId);
      if (success) {
        // Обновляем статус
        friendshipState.friendship = await checkFriendshipStatus(friendshipState.profileUserId);
      } else {
        alert('Не удалось отправить запрос на дружбу');
      }
    } else if (friendshipState.friendship.status === 'accepted') {
      // Удаляем дружбу
      const success = await deleteFriendship(friendshipState.friendship.id);
      if (success) {
        friendshipState.friendship = null;
      } else {
        alert('Не удалось удалить из друзей');
      }
    } else if (friendshipState.friendship.status === 'pending' && friendshipState.friendship.requester_id === currentUser?.id) {
      // Запрос уже отправлен - ничего не делаем
    }
  } catch (e) {
    console.error('Failed to handle friendship action:', e);
    alert('Произошла ошибка. Попробуйте обновить страницу.');
  } finally {
    friendshipState.loading = false;
    updateFriendshipButton();
  }
}

async function initFriendshipButton(userId) {
  if (!userId || !window.apiFetch) return;
  
  friendshipState.profileUserId = userId;
  friendshipState.loading = true;
  
  const container = document.getElementById('friendshipButtonContainer');
  const button = document.getElementById('friendshipButton');
  
  if (container) container.style.display = 'block';
  updateFriendshipButton();
  
  // Проверяем статус дружбы
  friendshipState.friendship = await checkFriendshipStatus(userId);
  
  friendshipState.loading = false;
  updateFriendshipButton();
  
  // Добавляем обработчик клика
  if (button) {
    button.onclick = handleFriendshipButtonClick;
  }
}

// ==================== Функции для отображения списка друзей ====================

let friendsListState = {
  loaded: false,
  loading: false,
  friends: [],
  filteredFriends: [],
  searchQuery: '',
  statusFilter: 'all', // 'all', 'online', 'playing'
  sortBy: 'name', // 'name', 'rating', 'recent'
};

function getInitials(username) {
  if (!username) return '?';
  const parts = username.trim().split(/\s+/);
  if (parts.length >= 2) {
    return (parts[0][0] + parts[1][0]).toUpperCase();
  }
  return username.substring(0, 2).toUpperCase();
}

function getHighestRating(user) {
  if (!user) return 1200;
  return Math.max(
    user.blitz_rating || 1200,
    user.bullet_rating || 1200,
    user.rapid_rating || 1200,
    user.puzzle_rating || 1200
  );
}

function createFriendCard(friendship) {
  const friend = friendship.user;
  if (!friend) return null;
  
  // Определяем статус (пока что статично, позже можно получать из API)
  const isOnline = friend.is_online || false;
  const isPlaying = friend.is_playing || false;
  
  const card = document.createElement('div');
  card.className = 'friend-card';
  card.dataset.friendId = friend.id;
  
  // Header с аватаром и информацией
  const header = document.createElement('div');
  header.className = 'friend-card-header';
  
  // Avatar wrapper
  const avatarWrapper = document.createElement('div');
  avatarWrapper.className = 'friend-avatar-wrapper';
  
  const avatar = document.createElement('div');
  avatar.className = 'friend-avatar';
  avatar.textContent = getInitials(friend.username || friend.display_name || '?');
  
  // Статус онлайна
  const status = document.createElement('div');
  status.className = 'friend-status';
  if (isPlaying) {
    status.classList.add('playing');
    status.title = 'Играет сейчас';
  } else if (isOnline) {
    status.classList.add('online');
    status.title = 'Онлайн';
  }
  
  avatarWrapper.appendChild(avatar);
  avatarWrapper.appendChild(status);
  
  // Информация о друге
  const info = document.createElement('div');
  info.className = 'friend-info';
  
  const name = document.createElement('div');
  name.className = 'friend-name';
  name.textContent = friend.display_name || friend.username || 'Неизвестно';
  
  const username = document.createElement('div');
  username.className = 'friend-username';
  username.textContent = `@${friend.username || friend.id}`;
  
  const meta = document.createElement('div');
  meta.className = 'friend-meta';
  
  const highestRating = getHighestRating(friend);
  const rating = document.createElement('span');
  rating.className = 'friend-rating';
  const ratingIcon = document.createElement('i');
  ratingIcon.className = 'fas fa-star';
  ratingIcon.style.color = 'var(--warning)';
  ratingIcon.style.fontSize = '0.75rem';
  rating.appendChild(ratingIcon);
  rating.appendChild(document.createTextNode(` ${highestRating}`));
  
  meta.appendChild(rating);
  
  // Активность (если есть информация)
  if (friend.last_seen) {
    const activity = document.createElement('span');
    activity.className = 'friend-activity';
    const activityIcon = document.createElement('i');
    activityIcon.className = 'fas fa-clock';
    activityIcon.style.fontSize = '0.75rem';
    activity.appendChild(activityIcon);
    activity.appendChild(document.createTextNode(` ${formatLastSeen(friend.last_seen)}`));
    meta.appendChild(activity);
  }
  
  info.appendChild(name);
  info.appendChild(username);
  info.appendChild(meta);
  
  header.appendChild(avatarWrapper);
  header.appendChild(info);
  
  // Действия
  const actions = document.createElement('div');
  actions.className = 'friend-card-actions';
  
  const playBtn = document.createElement('button');
  playBtn.className = 'friend-action-btn primary';
  const playIcon = document.createElement('i');
  playIcon.className = 'fas fa-chess';
  playBtn.appendChild(playIcon);
  playBtn.appendChild(document.createTextNode(' Играть'));
  playBtn.onclick = (e) => {
    e.stopPropagation();
    inviteFriendToGame(friend.id, friend.username || friend.display_name);
  };
  
  const profileBtn = document.createElement('button');
  profileBtn.className = 'friend-action-btn';
  const profileIcon = document.createElement('i');
  profileIcon.className = 'fas fa-user';
  profileBtn.appendChild(profileIcon);
  profileBtn.appendChild(document.createTextNode(' Профиль'));
  profileBtn.onclick = (e) => {
    e.stopPropagation();
    window.location.href = `/profile/${encodeURIComponent(friend.username || friend.id)}`;
  };
  
  const removeBtn = document.createElement('button');
  removeBtn.className = 'friend-action-btn danger';
  const removeIcon = document.createElement('i');
  removeIcon.className = 'fas fa-user-times';
  removeBtn.appendChild(removeIcon);
  removeBtn.appendChild(document.createTextNode(' Удалить'));
  removeBtn.onclick = (e) => {
    e.stopPropagation();
    if (confirm(`Удалить ${friend.username || friend.display_name} из друзей?`)) {
      deleteFriendship(friendship.id);
    }
  };
  
  actions.appendChild(playBtn);
  actions.appendChild(profileBtn);
  actions.appendChild(removeBtn);
  
  card.appendChild(header);
  card.appendChild(actions);
  
  // Клик по карточке ведет на профиль
  card.onclick = (e) => {
    if (!e.target.closest('button')) {
      window.location.href = `/profile/${encodeURIComponent(friend.username || friend.id)}`;
    }
  };
  
  return card;
}

function formatLastSeen(lastSeen) {
  if (!lastSeen) return '';
  const date = new Date(lastSeen);
  const now = new Date();
  const diffMs = now - date;
  const diffMins = Math.floor(diffMs / 60000);
  const diffHours = Math.floor(diffMs / 3600000);
  const diffDays = Math.floor(diffMs / 86400000);
  
  if (diffMins < 1) return 'Только что';
  if (diffMins < 60) return `${diffMins} мин назад`;
  if (diffHours < 24) return `${diffHours} ч назад`;
  if (diffDays < 7) return `${diffDays} дн назад`;
  return date.toLocaleDateString('ru-RU');
}

function filterFriends(friendships, query, statusFilter) {
  let filtered = friendships;
  
  // Фильтр по поиску
  if (query && query.trim().length > 0) {
    const searchTerm = query.toLowerCase().trim();
    filtered = filtered.filter(friendship => {
      const friend = friendship.user;
      if (!friend) return false;
      const username = (friend.username || '').toLowerCase();
      const displayName = (friend.display_name || '').toLowerCase();
      return username.includes(searchTerm) || displayName.includes(searchTerm);
    });
  }
  
  // Фильтр по статусу
  if (statusFilter !== 'all') {
    filtered = filtered.filter(friendship => {
      const friend = friendship.user;
      if (!friend) return false;
      if (statusFilter === 'online') {
        return friend.is_online || false;
      } else if (statusFilter === 'playing') {
        return friend.is_playing || false;
      }
      return true;
    });
  }
  
  return filtered;
}

function sortFriends(friendships, sortBy) {
  const sorted = [...friendships];
  
  sorted.sort((a, b) => {
    const friendA = a.user;
    const friendB = b.user;
    if (!friendA || !friendB) return 0;
    
    switch (sortBy) {
      case 'name':
        const nameA = (friendA.display_name || friendA.username || '').toLowerCase();
        const nameB = (friendB.display_name || friendB.username || '').toLowerCase();
        return nameA.localeCompare(nameB, 'ru');
      
      case 'rating':
        const ratingA = getHighestRating(friendA);
        const ratingB = getHighestRating(friendB);
        return ratingB - ratingA;
      
      case 'recent':
        // Сортировка по последней активности (если есть)
        const lastSeenA = friendA.last_seen ? new Date(friendA.last_seen).getTime() : 0;
        const lastSeenB = friendB.last_seen ? new Date(friendB.last_seen).getTime() : 0;
        return lastSeenB - lastSeenA;
      
      default:
        return 0;
    }
  });
  
  return sorted;
}

function groupFriends(friendships) {
  const online = [];
  const playing = [];
  const others = [];
  
  friendships.forEach(friendship => {
    const friend = friendship.user;
    if (!friend) return;
    
    if (friend.is_playing) {
      playing.push(friendship);
    } else if (friend.is_online) {
      online.push(friendship);
    } else {
      others.push(friendship);
    }
  });
  
  return { online, playing, others };
}

function renderFriendsList(friendships) {
  const container = document.getElementById('friendsList');
  const onlineContainer = document.getElementById('friendsOnlineList');
  const playingContainer = document.getElementById('friendsPlayingList');
  const othersContainer = document.getElementById('friendsOtherList');
  const countElement = document.getElementById('friendsCount');
  
  if (!container) return;
  
  // Применяем фильтры и сортировку
  let filtered = filterFriends(friendships, friendsListState.searchQuery, friendsListState.statusFilter);
  filtered = sortFriends(filtered, friendsListState.sortBy);
  friendsListState.filteredFriends = filtered;
  
  // Обновляем счетчик
  if (countElement) {
    const total = friendships.length;
    const filteredCount = filtered.length;
    if (friendsListState.searchQuery || friendsListState.statusFilter !== 'all') {
      countElement.textContent = `Показано ${filteredCount} из ${total} друзей`;
    } else {
      countElement.textContent = `${total} ${getPluralForm(total, 'друг', 'друга', 'друзей')}`;
    }
  }
  
  // Если фильтр "all" и нет поиска - группируем
  if (friendsListState.statusFilter === 'all' && !friendsListState.searchQuery) {
    const groups = groupFriends(filtered);
    
    // Показываем/скрываем группы
    const onlineGroup = document.getElementById('friendsOnlineGroup');
    const playingGroup = document.getElementById('friendsPlayingGroup');
    const otherGroup = document.getElementById('friendsOtherGroup');
    
    // Онлайн друзья
    if (onlineContainer && onlineGroup) {
      if (groups.online.length > 0) {
        onlineGroup.style.display = 'block';
        onlineContainer.innerHTML = '';
        groups.online.forEach(friendship => {
          const card = createFriendCard(friendship);
          if (card) onlineContainer.appendChild(card);
        });
        const onlineCount = document.getElementById('onlineCount');
        if (onlineCount) onlineCount.textContent = groups.online.length;
      } else {
        onlineGroup.style.display = 'none';
      }
    }
    
    // Играют сейчас
    if (playingContainer && playingGroup) {
      if (groups.playing.length > 0) {
        playingGroup.style.display = 'block';
        playingContainer.innerHTML = '';
        groups.playing.forEach(friendship => {
          const card = createFriendCard(friendship);
          if (card) playingContainer.appendChild(card);
        });
        const playingCount = document.getElementById('playingCount');
        if (playingCount) playingCount.textContent = groups.playing.length;
      } else {
        playingGroup.style.display = 'none';
      }
    }
    
    // Остальные
    if (othersContainer && otherGroup) {
      if (groups.others.length > 0) {
        otherGroup.style.display = 'block';
        othersContainer.innerHTML = '';
        groups.others.forEach(friendship => {
          const card = createFriendCard(friendship);
          if (card) othersContainer.appendChild(card);
        });
        const otherCount = document.getElementById('otherCount');
        if (otherCount) otherCount.textContent = groups.others.length;
      } else {
        otherGroup.style.display = 'none';
      }
    }
    
    // Скрываем основной список
    container.style.display = 'none';
  } else {
    // Показываем обычный список при фильтрации
    const onlineGroup = document.getElementById('friendsOnlineGroup');
    const playingGroup = document.getElementById('friendsPlayingGroup');
    const otherGroup = document.getElementById('friendsOtherGroup');
    if (onlineGroup) onlineGroup.style.display = 'none';
    if (playingGroup) playingGroup.style.display = 'none';
    if (otherGroup) otherGroup.style.display = 'none';
    
    container.style.display = 'grid';
    container.innerHTML = '';
    
    if (!filtered || filtered.length === 0) {
      const emptyDiv = document.createElement('div');
      emptyDiv.className = 'friends-empty';
      const icon = document.createElement('div');
      icon.className = 'friends-empty-icon';
      const iconEl = document.createElement('i');
      iconEl.className = friendsListState.searchQuery ? 'fas fa-search' : 'fas fa-user-friends';
      icon.appendChild(iconEl);
      
      const title = document.createElement('div');
      title.className = 'friends-empty-title';
      title.textContent = friendsListState.searchQuery 
        ? 'Друзья не найдены' 
        : 'У вас пока нет друзей';
      
      const text = document.createElement('div');
      text.className = 'friends-empty-text';
      text.textContent = friendsListState.searchQuery
        ? 'Попробуйте изменить параметры поиска'
        : 'Начните искать новых друзей, чтобы играть вместе';
      
      const actions = document.createElement('div');
      actions.className = 'friends-empty-actions';
      const addBtn = document.createElement('button');
      addBtn.className = 'btn btn-primary';
      addBtn.innerHTML = '<i class="fas fa-user-plus"></i> Добавить друга';
      addBtn.onclick = () => {
        if (typeof showAddFriendModal === 'function') {
          showAddFriendModal();
        }
      };
      actions.appendChild(addBtn);
      
      emptyDiv.appendChild(icon);
      emptyDiv.appendChild(title);
      emptyDiv.appendChild(text);
      emptyDiv.appendChild(actions);
      container.appendChild(emptyDiv);
      return;
    }
    
    filtered.forEach(friendship => {
      const card = createFriendCard(friendship);
      if (card) {
        container.appendChild(card);
      }
    });
  }
}

function getPluralForm(n, one, few, many) {
  const mod10 = n % 10;
  const mod100 = n % 100;
  
  if (mod100 >= 11 && mod100 <= 19) {
    return many;
  }
  if (mod10 === 1) {
    return one;
  }
  if (mod10 >= 2 && mod10 <= 4) {
    return few;
  }
  return many;
}

async function loadFriendsList() {
  const container = document.getElementById('friendsList');
  if (!container || !window.apiFetch) return;
  
  // Если уже загружено, не загружаем снова
  if (friendsListState.loaded && !friendsListState.loading) {
    renderFriendsList(friendsListState.friends);
    return;
  }
  
  // Если уже загружается, не начинаем новую загрузку
  if (friendsListState.loading) return;
  
  friendsListState.loading = true;
  
  // Показываем skeleton loaders
  container.innerHTML = '';
  container.className = 'friends-list';
  container.style.display = 'grid';
  
  // Скрываем группы при загрузке
  const onlineGroup = document.getElementById('friendsOnlineGroup');
  const playingGroup = document.getElementById('friendsPlayingGroup');
  const otherGroup = document.getElementById('friendsOtherGroup');
  if (onlineGroup) onlineGroup.style.display = 'none';
  if (playingGroup) playingGroup.style.display = 'none';
  if (otherGroup) otherGroup.style.display = 'none';
  
  // Создаем 6 skeleton карточек
  for (let i = 0; i < 6; i++) {
    const skeletonCard = document.createElement('div');
    skeletonCard.className = 'friend-card-skeleton';
    
    const skeletonHeader = document.createElement('div');
    skeletonHeader.className = 'friend-card-header';
    
    const skeletonAvatar = document.createElement('div');
    skeletonAvatar.className = 'skeleton-avatar';
    
    const skeletonInfo = document.createElement('div');
    skeletonInfo.style.flex = '1';
    skeletonInfo.style.display = 'flex';
    skeletonInfo.style.flexDirection = 'column';
    skeletonInfo.style.gap = '0.5rem';
    
    const skeletonName = document.createElement('div');
    skeletonName.className = 'skeleton-text medium';
    skeletonName.style.height = '1.25rem';
    
    const skeletonUsername = document.createElement('div');
    skeletonUsername.className = 'skeleton-text short';
    skeletonUsername.style.height = '0.875rem';
    
    skeletonInfo.appendChild(skeletonName);
    skeletonInfo.appendChild(skeletonUsername);
    
    skeletonHeader.appendChild(skeletonAvatar);
    skeletonHeader.appendChild(skeletonInfo);
    
    const skeletonActions = document.createElement('div');
    skeletonActions.className = 'friend-card-actions';
    skeletonActions.style.marginTop = '0.5rem';
    
    const skeletonBtn1 = document.createElement('div');
    skeletonBtn1.className = 'skeleton-text';
    skeletonBtn1.style.height = '2.25rem';
    skeletonBtn1.style.borderRadius = 'var(--radius-md)';
    
    const skeletonBtn2 = document.createElement('div');
    skeletonBtn2.className = 'skeleton-text';
    skeletonBtn2.style.height = '2.25rem';
    skeletonBtn2.style.borderRadius = 'var(--radius-md)';
    
    skeletonActions.appendChild(skeletonBtn1);
    skeletonActions.appendChild(skeletonBtn2);
    
    skeletonCard.appendChild(skeletonHeader);
    skeletonCard.appendChild(skeletonActions);
    container.appendChild(skeletonCard);
  }
  
  try {
    const res = await window.apiFetch('/api/friendships/me?status=accepted&limit=100');
    if (!res.ok) {
      throw new Error('Failed to load friends');
    }
    
    const data = await res.json();
    friendsListState.friends = data.friendships || [];
    friendsListState.loaded = true;
    
    // Обновляем счетчик при загрузке
    const countElement = document.getElementById('friendsCount');
    if (countElement && friendsListState.friends.length === 0) {
      countElement.textContent = 'Нет друзей';
    }
    
    renderFriendsList(friendsListState.friends);
  } catch (e) {
    console.error('Failed to load friends list:', e);
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'text-align: center; padding: 2rem; color: var(--danger); grid-column: 1 / -1;';
    const errorIcon = document.createElement('i');
    errorIcon.className = 'fas fa-exclamation-triangle';
    errorIcon.style.cssText = 'font-size: 2rem; margin-bottom: 1rem;';
    errorDiv.appendChild(errorIcon);
    const errorText = document.createElement('div');
    errorText.textContent = 'Не удалось загрузить список друзей';
    errorDiv.appendChild(errorText);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary';
    retryBtn.style.marginTop = '1rem';
    retryBtn.textContent = 'Попробовать снова';
    retryBtn.onclick = () => {
      friendsListState.loaded = false;
      loadFriendsList();
    };
    errorDiv.appendChild(retryBtn);
    container.appendChild(errorDiv);
  } finally {
    friendsListState.loading = false;
  }
}

// Экспортируем функцию для использования в HTML
window.loadFriendsList = loadFriendsList;
window.showAddFriendModal = showAddFriendModal;

// Инициализация поиска друзей
function initFriendsSearch() {
  const searchInput = document.getElementById('friendsSearchInput');
  const searchClear = document.getElementById('friendsSearchClear');
  
  if (!searchInput) return;
  
  // Debounce для поиска
  let searchTimeout = null;
  searchInput.addEventListener('input', (e) => {
    clearTimeout(searchTimeout);
    const query = e.target.value;
    
    // Показываем/скрываем кнопку очистки
    if (searchClear) {
      searchClear.style.display = query.length > 0 ? 'block' : 'none';
    }
    
    searchTimeout = setTimeout(() => {
      friendsListState.searchQuery = query;
      renderFriendsList(friendsListState.friends);
    }, 300);
  });
  
  // Очистка поиска
  if (searchClear) {
    searchClear.addEventListener('click', () => {
      searchInput.value = '';
      friendsListState.searchQuery = '';
      searchClear.style.display = 'none';
      renderFriendsList(friendsListState.friends);
    });
  }
  
  // Инициализация фильтров по статусу
  const filterButtons = document.querySelectorAll('.filter-btn[data-filter]');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      // Убираем active со всех кнопок
      filterButtons.forEach(b => b.classList.remove('active'));
      // Добавляем active к нажатой
      btn.classList.add('active');
      // Обновляем фильтр
      friendsListState.statusFilter = btn.dataset.filter;
      renderFriendsList(friendsListState.friends);
    });
  });
  
  // Инициализация сортировки
  const sortSelect = document.getElementById('friendsSortSelect');
  if (sortSelect) {
    sortSelect.value = friendsListState.sortBy;
    sortSelect.addEventListener('change', (e) => {
      friendsListState.sortBy = e.target.value;
      renderFriendsList(friendsListState.friends);
    });
  }
}

// Функция приглашения друга в игру
async function inviteFriendToGame(friendId, friendUsername) {
  try {
    // Создаем игру с приглашением друга
    if (!window.apiFetch) {
      if (typeof window.showToast === 'function') {
        window.showToast('Необходимо войти в систему', 'error');
      }
      window.location.href = '/login';
      return;
    }
    
    // Создаем игру (стандартные настройки)
    const gameData = {
      creator_color: 'white',
      time_control: {
        initial_ms: 300000, // 5 минут
        increment_ms: 0,
        type: 'STANDARD'
      },
      metadata: {
        invited_friend_id: friendId,
        invited_friend_username: friendUsername
      }
    };
    
    const res = await window.apiFetch('/api/games/', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(gameData)
    });
    
    if (!res.ok) {
      throw new Error('Failed to create game');
    }
    
    const game = await res.json();
    
    // Переходим на страницу игры
    window.location.href = `/match/${game.id}`;
    
    // Отправляем уведомление другу (если есть API для этого)
    // TODO: Реализовать отправку уведомления через notifications service
    
  } catch (e) {
    console.error('Error inviting friend to game:', e);
    if (typeof window.showToast === 'function') {
      window.showToast('Ошибка при создании игры', 'error');
    } else {
      alert('Ошибка при создании игры');
    }
  }
}

// Модальное окно для добавления друга
function showAddFriendModal() {
  // Создаем модальное окно для поиска и добавления друзей
  const modal = document.createElement('div');
  modal.className = 'modal';
  modal.id = 'addFriendModal';
  modal.style.display = 'flex';
  
  const modalContent = document.createElement('div');
  modalContent.className = 'modal-content';
  modalContent.style.maxWidth = '500px';
  
  const header = document.createElement('div');
  header.style.cssText = 'display: flex; justify-content: space-between; align-items: center; margin-bottom: 1.5rem;';
  
  const title = document.createElement('h2');
  title.textContent = 'Добавить друга';
  title.style.margin = '0';
  
  const closeBtn = document.createElement('button');
  closeBtn.className = 'btn btn-icon';
  closeBtn.innerHTML = '<i class="fas fa-times"></i>';
  closeBtn.onclick = () => {
    modal.remove();
  };
  
  header.appendChild(title);
  header.appendChild(closeBtn);
  
  // Поиск пользователей
  const searchContainer = document.createElement('div');
  searchContainer.style.marginBottom = '1.5rem';
  
  const searchBox = document.createElement('div');
  searchBox.className = 'search-box';
  searchBox.style.marginBottom = '1rem';
  
  const searchIcon = document.createElement('i');
  searchIcon.className = 'fas fa-search';
  
  const searchInput = document.createElement('input');
  searchInput.type = 'text';
  searchInput.placeholder = 'Введите имя пользователя...';
  searchInput.id = 'userSearchInput';
  searchInput.autocomplete = 'off';
  
  searchBox.appendChild(searchIcon);
  searchBox.appendChild(searchInput);
  searchContainer.appendChild(searchBox);
  
  // Результаты поиска
  const resultsContainer = document.createElement('div');
  resultsContainer.id = 'userSearchResults';
  resultsContainer.style.maxHeight = '400px';
  resultsContainer.style.overflowY = 'auto';
  
  let searchTimeout = null;
  let currentSearchQuery = '';
  
  searchInput.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    currentSearchQuery = query;
    
    clearTimeout(searchTimeout);
    
    if (query.length < 2) {
      resultsContainer.innerHTML = '';
      return;
    }
    
    searchTimeout = setTimeout(async () => {
      resultsContainer.innerHTML = '<div style="text-align: center; padding: 2rem;"><i class="fas fa-spinner fa-spin"></i></div>';
      
      try {
        const res = await window.apiFetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=10`);
        if (!res.ok) throw new Error('Search failed');
        
        const data = await res.json();
        
        // Проверяем, что это все еще актуальный запрос
        if (currentSearchQuery !== query) return;
        
        resultsContainer.innerHTML = '';
        
        if (!data.users || data.users.length === 0) {
          const empty = document.createElement('div');
          empty.style.cssText = 'text-align: center; padding: 2rem; color: var(--muted-foreground);';
          empty.textContent = 'Пользователи не найдены';
          resultsContainer.appendChild(empty);
          return;
        }
        
        data.users.forEach(user => {
          const userCard = createUserSearchCard(user);
          resultsContainer.appendChild(userCard);
        });
      } catch (e) {
        console.error('Search error:', e);
        resultsContainer.innerHTML = '<div style="text-align: center; padding: 2rem; color: var(--danger);">Ошибка поиска</div>';
      }
    }, 500);
  });
  
  // Закрытие по клику вне модального окна
  modal.addEventListener('click', (e) => {
    if (e.target === modal) {
      modal.remove();
    }
  });
  
  modalContent.appendChild(header);
  modalContent.appendChild(searchContainer);
  modalContent.appendChild(resultsContainer);
  modal.appendChild(modalContent);
  document.body.appendChild(modal);
  
  searchInput.focus();
}

function createUserSearchCard(user) {
  const card = document.createElement('div');
  card.className = 'user-search-card';
  card.style.cssText = 'display: flex; align-items: center; gap: 1rem; padding: 1rem; border: 1px solid var(--border); border-radius: 0.5rem; margin-bottom: 0.5rem;';
  
  const avatar = document.createElement('div');
  avatar.className = 'friend-avatar';
  avatar.textContent = getInitials(user.username || user.display_name || '?');
  
  const info = document.createElement('div');
  info.style.flex = '1';
  
  const name = document.createElement('div');
  name.className = 'friend-name';
  name.textContent = user.username || user.display_name || 'Неизвестно';
  
  const rating = document.createElement('div');
  rating.className = 'friend-rating';
  const highestRating = getHighestRating(user);
  rating.innerHTML = `⭐ ${highestRating}`;
  
  info.appendChild(name);
  info.appendChild(rating);
  
  const actionBtn = document.createElement('button');
  actionBtn.className = 'btn btn-primary';
  actionBtn.innerHTML = '<i class="fas fa-user-plus"></i> Добавить';
  
  // Проверяем статус дружбы
  let friendshipStatus = null;
  actionBtn.onclick = async () => {
    actionBtn.disabled = true;
    
    try {
      // Проверяем текущий статус
      const statusRes = await window.apiFetch(`/api/friendships/status/${user.id}`);
      if (statusRes.ok) {
        const statusData = await statusRes.json();
        friendshipStatus = statusData;
      }
      
      if (!friendshipStatus) {
        // Отправляем запрос
        const res = await window.apiFetch('/api/friendships/', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ addressee_id: user.id })
        });
        
        if (res.ok) {
          if (typeof window.showToast === 'function') {
            window.showToast(`Запрос отправлен ${user.username || user.display_name}`, 'success');
          }
          actionBtn.innerHTML = '<i class="fas fa-clock"></i> Запрос отправлен';
          actionBtn.disabled = true;
        } else {
          throw new Error('Failed to send request');
        }
      } else if (friendshipStatus.status === 'pending') {
        if (friendshipStatus.requester_id === currentUser?.id) {
          actionBtn.innerHTML = '<i class="fas fa-clock"></i> Запрос отправлен';
          actionBtn.disabled = true;
        } else {
          actionBtn.innerHTML = '<i class="fas fa-check"></i> Принять';
          actionBtn.onclick = async () => {
            const acceptRes = await window.apiFetch(`/api/friendships/${friendshipStatus.id}`, {
              method: 'PATCH',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ status: 'accepted' })
            });
            if (acceptRes.ok) {
              actionBtn.innerHTML = '<i class="fas fa-check"></i> Друзья';
              actionBtn.disabled = true;
              if (typeof window.loadFriendsList === 'function') {
                await window.loadFriendsList();
              }
            }
          };
        }
      } else if (friendshipStatus.status === 'accepted') {
        actionBtn.innerHTML = '<i class="fas fa-check"></i> Уже друзья';
        actionBtn.disabled = true;
      }
    } catch (e) {
      console.error('Error:', e);
      if (typeof window.showToast === 'function') {
        window.showToast('Ошибка при добавлении друга', 'error');
      }
      actionBtn.disabled = false;
    }
  };
  
  card.appendChild(avatar);
  card.appendChild(info);
  card.appendChild(actionBtn);
  
  return card;
}

// ==================== Функции для работы с входящими заявками ====================

let friendRequestsState = {
  loaded: false,
  loading: false,
  requests: [],
};

function createRequestCard(friendship) {
  if (!friendship || !friendship.user) return null;
  
  const requester = friendship.user;
  const card = document.createElement('div');
  card.className = 'friend-card';
  card.style.position = 'relative';
  
  // Аватар
  const avatar = document.createElement('div');
  avatar.className = 'friend-avatar';
  const initials = getInitials(requester.username || requester.display_name || '?');
  avatar.textContent = initials;
  card.appendChild(avatar);
  
  // Имя пользователя
  const name = document.createElement('div');
  name.className = 'friend-name';
  name.textContent = requester.username || requester.display_name || 'Неизвестный';
  card.appendChild(name);
  
  // Рейтинг
  const rating = getHighestRating(requester);
  if (rating) {
    const ratingEl = document.createElement('div');
    ratingEl.className = 'friend-rating';
    ratingEl.textContent = `Рейтинг: ${rating}`;
    card.appendChild(ratingEl);
  }
  
  // Кнопки действий
  const actions = document.createElement('div');
  actions.style.cssText = 'display: flex; gap: 0.5rem; margin-top: 1rem;';
  
  const acceptBtn = document.createElement('button');
  acceptBtn.className = 'btn btn-primary';
  acceptBtn.style.flex = '1';
  acceptBtn.innerHTML = '<i class="fas fa-check"></i> Принять';
  acceptBtn.onclick = async () => {
    acceptBtn.disabled = true;
    acceptBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const success = await acceptFriendRequest(friendship.id);
    if (success) {
      friendRequestsState.loaded = false;
      await loadFriendRequests();
      if (typeof window.loadFriendsList === 'function') {
        window.loadFriendsList();
      }
    } else {
      acceptBtn.disabled = false;
      acceptBtn.innerHTML = '<i class="fas fa-check"></i> Принять';
      alert('Не удалось принять заявку');
    }
  };
  
  const declineBtn = document.createElement('button');
  declineBtn.className = 'btn btn-outline';
  declineBtn.style.flex = '1';
  declineBtn.innerHTML = '<i class="fas fa-times"></i> Отклонить';
  declineBtn.onclick = async () => {
    declineBtn.disabled = true;
    declineBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';
    const success = await declineFriendRequest(friendship.id);
    if (success) {
      friendRequestsState.loaded = false;
      await loadFriendRequests();
    } else {
      declineBtn.disabled = false;
      declineBtn.innerHTML = '<i class="fas fa-times"></i> Отклонить';
      alert('Не удалось отклонить заявку');
    }
  };
  
  actions.appendChild(acceptBtn);
  actions.appendChild(declineBtn);
  card.appendChild(actions);
  
  return card;
}

function renderFriendRequests(requests) {
  const container = document.getElementById('friendRequestsList');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!requests || requests.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'text-align: center; padding: 3rem; color: var(--muted-foreground); grid-column: 1 / -1;';
    const icon = document.createElement('i');
    icon.className = 'fas fa-inbox';
    icon.style.cssText = 'font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;';
    emptyDiv.appendChild(icon);
    const text = document.createElement('div');
    text.textContent = 'У вас нет входящих заявок';
    text.style.fontSize = '1.125rem';
    emptyDiv.appendChild(text);
    container.appendChild(emptyDiv);
    return;
  }
  
  requests.forEach(request => {
    console.log('Processing request:', request);
    const card = createRequestCard(request);
    if (card) {
      container.appendChild(card);
    } else {
      console.warn('Failed to create card for request:', request);
    }
  });
}

async function loadFriendRequests() {
  const container = document.getElementById('friendRequestsList');
  if (!container || !window.apiFetch) return;

  if (friendRequestsState.loaded && !friendRequestsState.loading) {
    renderFriendRequests(friendRequestsState.requests);
    return;
  }

  if (friendRequestsState.loading) return;

  friendRequestsState.loading = true;
  container.innerHTML = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'text-align: center; padding: 2rem; color: var(--muted-foreground); grid-column: 1 / -1;';
  const spinner = document.createElement('i');
  spinner.className = 'fas fa-spinner fa-spin';
  spinner.style.cssText = 'font-size: 2rem; margin-bottom: 1rem;';
  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(document.createTextNode('Загрузка заявок...'));
  container.appendChild(loadingDiv);

  try {
    const res = await window.apiFetch('/api/friendships/requests/incoming?limit=100');
    if (!res.ok) {
      const errorText = await res.text();
      console.error('Failed to load friend requests:', res.status, errorText);
      throw new Error('Failed to load friend requests');
    }
    const data = await res.json();
    console.log('Friend requests data:', data);
    friendRequestsState.requests = data.friendships || [];
    friendRequestsState.loaded = true;
    renderFriendRequests(friendRequestsState.requests);
  } catch (e) {
    console.error('Error loading friend requests:', e);
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'text-align: center; padding: 2rem; color: var(--danger); grid-column: 1 / -1;';
    const errorIcon = document.createElement('i');
    errorIcon.className = 'fas fa-exclamation-triangle';
    errorIcon.style.cssText = 'font-size: 2rem; margin-bottom: 1rem;';
    errorDiv.appendChild(errorIcon);
    const errorText = document.createElement('div');
    errorText.textContent = 'Не удалось загрузить заявки';
    errorDiv.appendChild(errorText);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary';
    retryBtn.style.marginTop = '1rem';
    retryBtn.textContent = 'Попробовать снова';
    retryBtn.onclick = () => {
      friendRequestsState.loaded = false;
      loadFriendRequests();
    };
    errorDiv.appendChild(retryBtn);
    container.appendChild(errorDiv);
  } finally {
    friendRequestsState.loading = false;
  }
}

async function acceptFriendRequest(friendshipId) {
  if (!friendshipId || !window.apiFetch) return false;
  
  try {
    const res = await window.apiFetch(`/api/friendships/${friendshipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'accepted' }),
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to accept friend request:', e);
    return false;
  }
}

async function declineFriendRequest(friendshipId) {
  if (!friendshipId || !window.apiFetch) return false;
  
  try {
    const res = await window.apiFetch(`/api/friendships/${friendshipId}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'declined' }),
    });
    return res.ok;
  } catch (e) {
    console.error('Failed to decline friend request:', e);
    return false;
  }
}

window.loadFriendRequests = loadFriendRequests;

// ==================== Функции для работы с историей рейтингов ====================

let ratingHistoryState = {
  loaded: false,
  loading: false,
  entries: [],
  currentFormat: 'all',
};

const formatDisplayNames = {
  blitz: 'Блиц',
  rapid: 'Рапид',
  bullet: 'Пуля',
  puzzle: 'Задачи',
};

function createRatingHistoryEntry(entry) {
  const card = document.createElement('div');
  card.className = 'rating-history-entry';
  card.style.cssText = 'display: flex; align-items: center; justify-content: space-between; padding: 1rem; border: 1px solid var(--border); border-radius: 0.5rem; margin-bottom: 0.75rem; background: var(--card); transition: all 0.2s;';
  
  card.onmouseenter = () => {
    card.style.borderColor = 'var(--primary)';
    card.style.boxShadow = '0 2px 8px rgba(124, 58, 237, 0.1)';
  };
  card.onmouseleave = () => {
    card.style.borderColor = 'var(--border)';
    card.style.boxShadow = 'none';
  };
  
  const left = document.createElement('div');
  left.style.display = 'flex';
  left.style.alignItems = 'center';
  left.style.gap = '1rem';
  
  const formatBadge = document.createElement('div');
  formatBadge.className = 'format-badge';
  formatBadge.textContent = formatDisplayNames[entry.format_type] || entry.format_type;
  formatBadge.style.cssText = 'padding: 0.25rem 0.75rem; border-radius: 0.25rem; background: var(--primary); color: white; font-size: 0.875rem; font-weight: 600;';
  
  const info = document.createElement('div');
  
  const resultText = document.createElement('div');
  resultText.style.cssText = 'font-weight: 600; margin-bottom: 0.25rem;';
  
  let resultIcon = '';
  let resultColor = '';
  if (entry.result === 'win') {
    resultIcon = '✓';
    resultColor = 'var(--success)';
    resultText.textContent = 'Победа';
  } else if (entry.result === 'loss') {
    resultIcon = '✗';
    resultColor = 'var(--danger)';
    resultText.textContent = 'Поражение';
  } else if (entry.result === 'draw') {
    resultIcon = '=';
    resultColor = 'var(--muted-foreground)';
    resultText.textContent = 'Ничья';
  } else {
    resultText.textContent = 'Игра';
  }
  
  resultText.style.color = resultColor;
  
  const dateText = document.createElement('div');
  dateText.style.cssText = 'font-size: 0.875rem; color: var(--muted-foreground);';
  const date = new Date(entry.created_at);
  dateText.textContent = date.toLocaleString('ru-RU', { 
    year: 'numeric', 
    month: 'short', 
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
  
  info.appendChild(resultText);
  info.appendChild(dateText);
  
  left.appendChild(formatBadge);
  left.appendChild(info);
  
  const right = document.createElement('div');
  right.style.display = 'flex';
  right.style.alignItems = 'center';
  right.style.gap = '1rem';
  
  const ratingChange = document.createElement('div');
  ratingChange.style.cssText = 'text-align: right;';
  
  const changeValue = document.createElement('div');
  changeValue.style.cssText = `font-weight: 700; font-size: 1.125rem; color: ${entry.rating_change >= 0 ? 'var(--success)' : 'var(--danger)'};`;
  changeValue.textContent = `${entry.rating_change >= 0 ? '+' : ''}${entry.rating_change}`;
  
  const ratingRange = document.createElement('div');
  ratingRange.style.cssText = 'font-size: 0.875rem; color: var(--muted-foreground);';
  ratingRange.textContent = `${entry.rating_before} → ${entry.rating_after}`;
  
  ratingChange.appendChild(changeValue);
  ratingChange.appendChild(ratingRange);
  
  right.appendChild(ratingChange);
  
  card.appendChild(left);
  card.appendChild(right);
  
  return card;
}

function renderRatingHistory(entries) {
  const container = document.getElementById('ratingHistoryList');
  if (!container) return;
  
  container.innerHTML = '';
  
  if (!entries || entries.length === 0) {
    const emptyDiv = document.createElement('div');
    emptyDiv.style.cssText = 'text-align: center; padding: 3rem; color: var(--muted-foreground);';
    const icon = document.createElement('i');
    icon.className = 'fas fa-chart-line';
    icon.style.cssText = 'font-size: 3rem; margin-bottom: 1rem; opacity: 0.5;';
    emptyDiv.appendChild(icon);
    const text = document.createElement('div');
    text.textContent = 'История рейтингов пуста';
    text.style.fontSize = '1.125rem';
    emptyDiv.appendChild(text);
    container.appendChild(emptyDiv);
    return;
  }
  
  entries.forEach(entry => {
    const card = createRatingHistoryEntry(entry);
    container.appendChild(card);
  });
}

async function loadRatingHistory(formatType = null) {
  const container = document.getElementById('ratingHistoryList');
  if (!container || !window.apiFetch) return;
  
  const userId = window.profileUserId || null;
  const format = formatType || ratingHistoryState.currentFormat;
  
  if (ratingHistoryState.loading) return;
  
  ratingHistoryState.loading = true;
  
  container.innerHTML = '';
  const loadingDiv = document.createElement('div');
  loadingDiv.style.cssText = 'text-align: center; padding: 2rem; color: var(--muted-foreground);';
  const spinner = document.createElement('i');
  spinner.className = 'fas fa-spinner fa-spin';
  spinner.style.cssText = 'font-size: 2rem; margin-bottom: 1rem;';
  loadingDiv.appendChild(spinner);
  loadingDiv.appendChild(document.createTextNode('Загрузка истории рейтингов...'));
  container.appendChild(loadingDiv);
  
  try {
    const url = userId 
      ? `/api/ratings/history/${userId}${format !== 'all' ? `?format_type=${format}` : ''}`
      : `/api/ratings/history/me${format !== 'all' ? `?format_type=${format}` : ''}`;
    
    const res = await window.apiFetch(url);
    if (!res.ok) {
      throw new Error('Failed to load rating history');
    }
    
    const data = await res.json();
    ratingHistoryState.entries = data.entries || [];
    ratingHistoryState.loaded = true;
    
    renderRatingHistory(ratingHistoryState.entries);
  } catch (e) {
    console.error('Failed to load rating history:', e);
    container.innerHTML = '';
    const errorDiv = document.createElement('div');
    errorDiv.style.cssText = 'text-align: center; padding: 2rem; color: var(--danger);';
    const errorIcon = document.createElement('i');
    errorIcon.className = 'fas fa-exclamation-triangle';
    errorIcon.style.cssText = 'font-size: 2rem; margin-bottom: 1rem;';
    errorDiv.appendChild(errorIcon);
    const errorText = document.createElement('div');
    errorText.textContent = 'Не удалось загрузить историю рейтингов';
    errorDiv.appendChild(errorText);
    const retryBtn = document.createElement('button');
    retryBtn.className = 'btn btn-primary';
    retryBtn.style.marginTop = '1rem';
    retryBtn.textContent = 'Попробовать снова';
    retryBtn.onclick = () => {
      ratingHistoryState.loaded = false;
      loadRatingHistory();
    };
    errorDiv.appendChild(retryBtn);
    container.appendChild(errorDiv);
  } finally {
    ratingHistoryState.loading = false;
  }
}

window.loadRatingHistory = loadRatingHistory;

// Инициализация фильтров истории рейтингов
function initRatingHistoryFilters() {
  const filterTabs = document.querySelectorAll('.rating-filter-tabs .filter-tab');
  filterTabs.forEach(tab => {
    tab.addEventListener('click', () => {
      filterTabs.forEach(t => t.classList.remove('active'));
      tab.classList.add('active');
      const format = tab.dataset.format;
      ratingHistoryState.currentFormat = format;
      loadRatingHistory(format === 'all' ? null : format);
    });
  });
}

const formatNames = {
  bullet: 'Пуля',
  blitz: 'Блиц',
  rapid: 'Рапид',
  classical: 'Классика'
};

const formatIcons = {
  bullet: 'fa-bolt',
  blitz: 'fa-bolt',
  rapid: 'fa-clock',
  classical: 'fa-chess'
};

async function loadGameStats(username = null) {
  try {
    // Проверяем наличие apiFetch
    if (typeof window.apiFetch !== 'function') {
      throw new Error('apiFetch не доступен. Убедитесь, что auth.js загружен.');
    }
    
    // Если передан username, загружаем статистику этого пользователя, иначе текущего
    const statsPath = username ? `/api/users/${encodeURIComponent(username)}/stats` : '/api/users/me/stats';
    const statsRes = await window.apiFetch(statsPath);
    if (!statsRes.ok) {
      throw new Error('Failed to load stats');
    }
    const stats = await statsRes.json();
    
    // Обновляем общую статистику
    const totalGamesEl = document.getElementById('totalGames');
    const overallWinRateEl = document.getElementById('overallWinRate');
    const overallRatingEl = document.getElementById('overallRating');
    
    if (totalGamesEl) totalGamesEl.textContent = stats.total_games || 0;
    if (overallWinRateEl) overallWinRateEl.textContent = `${stats.overall_win_rate || 0}%`;
    
    // Вычисляем общий рейтинг как сумму рейтингов блица, рапида, пули и задач
    const blitzRating = stats.blitz_rating || 1200;
    const rapidRating = stats.rapid_rating || 1200;
    const bulletRating = stats.bullet_rating || 1200;
    const puzzleRating = stats.puzzle_rating || 1200;
    const overallRating = blitzRating + rapidRating + bulletRating + puzzleRating;
    
    if (overallRatingEl) overallRatingEl.textContent = overallRating;
    
    // Обновляем hero section с рейтингом
    if (typeof window.updateHeroSection === 'function' && currentUser) {
      const userWithRating = { ...currentUser, rating: overallRating };
      window.updateHeroSection(userWithRating);
    }
    
    // Обновляем график статистики побед
    if (typeof window.updateWinRateChart === 'function') {
      const wins = stats.total_wins || 0;
      const draws = stats.total_draws || 0;
      const losses = stats.total_losses || 0;
      window.updateWinRateChart(wins, draws, losses);
      
      // Обновляем статистику в footer графика
      const winRateStat = document.getElementById('winRateStat');
      const totalGamesStat = document.getElementById('totalGamesStat');
      const totalGames = wins + draws + losses;
      const winRate = totalGames > 0 ? Math.round((wins / totalGames) * 100) : 0;
      if (winRateStat) winRateStat.textContent = `${winRate}%`;
      if (totalGamesStat) totalGamesStat.textContent = totalGames;
    }
    
    // Обновляем график форматов
    if (typeof window.updateFormatStatsChart === 'function' && stats.by_format) {
      window.updateFormatStatsChart(stats);
    }
    
    // Обновляем виджеты dashboard
    updateDashboardWidgets(stats);
    
    // Обновляем статистику по форматам
    const formatStatsGrid = document.getElementById('formatStatsGrid');
    if (formatStatsGrid && stats.by_format && stats.by_format.length > 0) {
      formatStatsGrid.innerHTML = '';
      stats.by_format.forEach(fmt => {
        const card = document.createElement('div');
        card.className = 'format-stat-card';
        
        const formatName = formatNames[fmt.format] || fmt.format;
        const formatIcon = formatIcons[fmt.format] || 'fa-chess';
        
        let rating = 1200;
        if (fmt.format === 'bullet') rating = stats.bullet_rating || 1200;
        else if (fmt.format === 'blitz') rating = stats.blitz_rating || 1200;
        else if (fmt.format === 'rapid') rating = stats.rapid_rating || 1200;
        else if (fmt.format === 'classical') rating = stats.rapid_rating || 1200;
        
        // Создаем элементы безопасным способом
        const headerDiv = document.createElement('div');
        headerDiv.className = 'format-stat-header';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'format-stat-icon';
        const icon = document.createElement('i');
        icon.className = `fas ${formatIcon}`;
        iconDiv.appendChild(icon);
        
        const titleDiv = document.createElement('div');
        titleDiv.className = 'format-stat-title';
        titleDiv.textContent = formatName;
        
        headerDiv.appendChild(iconDiv);
        headerDiv.appendChild(titleDiv);
        
        const ratingDiv = document.createElement('div');
        ratingDiv.className = 'format-stat-rating';
        ratingDiv.textContent = rating;
        
        const labelDiv = document.createElement('div');
        labelDiv.className = 'format-stat-label';
        labelDiv.textContent = 'Рейтинг';
        
        const detailsDiv = document.createElement('div');
        detailsDiv.className = 'format-stat-details';
        
        const gamesDetail = document.createElement('div');
        gamesDetail.className = 'format-stat-detail';
        const gamesLabel = document.createElement('span');
        gamesLabel.className = 'format-stat-detail-label';
        gamesLabel.textContent = 'Партий:';
        const gamesValue = document.createElement('span');
        gamesValue.className = 'format-stat-detail-value';
        gamesValue.textContent = fmt.games_played;
        gamesDetail.appendChild(gamesLabel);
        gamesDetail.appendChild(gamesValue);
        
        const winsDetail = document.createElement('div');
        winsDetail.className = 'format-stat-detail';
        const winsLabel = document.createElement('span');
        winsLabel.className = 'format-stat-detail-label';
        winsLabel.textContent = 'Побед:';
        const winsValue = document.createElement('span');
        winsValue.className = 'format-stat-detail-value';
        winsValue.style.color = 'var(--success)';
        winsValue.textContent = fmt.wins;
        winsDetail.appendChild(winsLabel);
        winsDetail.appendChild(winsValue);
        
        const lossesDetail = document.createElement('div');
        lossesDetail.className = 'format-stat-detail';
        const lossesLabel = document.createElement('span');
        lossesLabel.className = 'format-stat-detail-label';
        lossesLabel.textContent = 'Поражений:';
        const lossesValue = document.createElement('span');
        lossesValue.className = 'format-stat-detail-value';
        lossesValue.style.color = 'var(--danger)';
        lossesValue.textContent = fmt.losses;
        lossesDetail.appendChild(lossesLabel);
        lossesDetail.appendChild(lossesValue);
        
        const drawsDetail = document.createElement('div');
        drawsDetail.className = 'format-stat-detail';
        const drawsLabel = document.createElement('span');
        drawsLabel.className = 'format-stat-detail-label';
        drawsLabel.textContent = 'Ничьих:';
        const drawsValue = document.createElement('span');
        drawsValue.className = 'format-stat-detail-value';
        drawsValue.style.color = 'var(--muted-foreground)';
        drawsValue.textContent = fmt.draws;
        drawsDetail.appendChild(drawsLabel);
        drawsDetail.appendChild(drawsValue);
        
        const winRateDetail = document.createElement('div');
        winRateDetail.className = 'format-stat-detail';
        const winRateLabel = document.createElement('span');
        winRateLabel.className = 'format-stat-detail-label';
        winRateLabel.textContent = 'Винрейт:';
        const winRateValue = document.createElement('span');
        winRateValue.className = 'format-stat-detail-value';
        winRateValue.style.color = 'var(--success)';
        winRateValue.style.fontWeight = '600';
        winRateValue.textContent = `${fmt.win_rate}%`;
        winRateDetail.appendChild(winRateLabel);
        winRateDetail.appendChild(winRateValue);
        
        detailsDiv.appendChild(gamesDetail);
        detailsDiv.appendChild(winsDetail);
        detailsDiv.appendChild(lossesDetail);
        detailsDiv.appendChild(drawsDetail);
        detailsDiv.appendChild(winRateDetail);
        
        card.appendChild(headerDiv);
        card.appendChild(ratingDiv);
        card.appendChild(labelDiv);
        card.appendChild(detailsDiv);
        formatStatsGrid.appendChild(card);
      });
    } else if (formatStatsGrid) {
      formatStatsGrid.textContent = '';
      const emptyCard = document.createElement('div');
      emptyCard.className = 'format-stat-card';
      emptyCard.style.textAlign = 'center';
      emptyCard.style.padding = '2rem';
      emptyCard.style.color = 'var(--muted-foreground)';
      emptyCard.style.gridColumn = '1 / -1';
      const emptyIcon = document.createElement('i');
      emptyIcon.className = 'fas fa-chess-knight';
      emptyIcon.style.fontSize = '2rem';
      emptyIcon.style.marginBottom = '1rem';
      const emptyText = document.createElement('div');
      emptyText.textContent = 'Пока нет завершенных партий';
      emptyCard.appendChild(emptyIcon);
      emptyCard.appendChild(emptyText);
      formatStatsGrid.appendChild(emptyCard);
    }
  } catch (e) {
    console.error('Failed to load game stats:', e);
    const formatStatsGrid = document.getElementById('formatStatsGrid');
    if (formatStatsGrid) {
      formatStatsGrid.textContent = '';
      const errorCard = document.createElement('div');
      errorCard.className = 'format-stat-card';
      errorCard.style.textAlign = 'center';
      errorCard.style.padding = '2rem';
      errorCard.style.color = 'var(--danger)';
      errorCard.style.gridColumn = '1 / -1';
      const errorIcon = document.createElement('i');
      errorIcon.className = 'fas fa-exclamation-triangle';
      errorIcon.style.fontSize = '2rem';
      errorIcon.style.marginBottom = '1rem';
      const errorText = document.createElement('div');
      errorText.textContent = 'Не удалось загрузить статистику';
      errorCard.appendChild(errorIcon);
      errorCard.appendChild(errorText);
      formatStatsGrid.appendChild(errorCard);
    }
  }
}

// Обновление виджетов dashboard
function updateDashboardWidgets(stats) {
  // Обновляем активность (игры сегодня и на неделе)
  // TODO: Получать эти данные из API когда будет доступно
  const gamesToday = document.getElementById('gamesToday');
  const gamesThisWeek = document.getElementById('gamesThisWeek');
  if (gamesToday) gamesToday.textContent = '0'; // Заглушка
  if (gamesThisWeek) gamesThisWeek.textContent = '0'; // Заглушка
  
  // Обновляем рекорды
  const bestRating = document.getElementById('bestRating');
  const bestWinStreak = document.getElementById('bestWinStreak');
  
  // Находим лучший рейтинг среди всех форматов
  if (bestRating) {
    const ratings = [
      stats.blitz_rating || 0,
      stats.rapid_rating || 0,
      stats.bullet_rating || 0
    ].filter(r => r > 0);
    const maxRating = ratings.length > 0 ? Math.max(...ratings) : 1200;
    bestRating.textContent = maxRating;
  }
  
  // Лучшая серия побед (пока заглушка, нужно получать из API)
  if (bestWinStreak) bestWinStreak.textContent = '—';
}

// Обновление графика форматов
window.updateFormatStatsChart = function(stats) {
  if (typeof Chart === 'undefined') return;
  
  const chart = Chart.getChart('formatStatsChart');
  if (!chart) return;
  
  const blitzGames = stats.by_format?.find(f => f.format === 'blitz')?.games_played || 0;
  const rapidGames = stats.by_format?.find(f => f.format === 'rapid')?.games_played || 0;
  const bulletGames = stats.by_format?.find(f => f.format === 'bullet')?.games_played || 0;
  
  chart.data.datasets[0].data = [blitzGames, rapidGames, bulletGames];
  chart.update();
};

document.addEventListener('DOMContentLoaded', async () => {
  try {
    // Определяем username из URL (для страницы профиля)
    const pathMatch = window.location.pathname.match(/^\/profile\/(.+)$/);
    const profileUsername = pathMatch ? decodeURIComponent(pathMatch[1]) : null;
    
    if (profileUsername) {
      // Загружаем профиль пользователя по username
      const userRes = await fetch(`/api/users/${encodeURIComponent(profileUsername)}`);
      if (!userRes.ok) {
        // Показываем сообщение об ошибке вместо полной замены body
        const mainContent = document.querySelector('main') || document.body;
        mainContent.textContent = '';
        const errorDiv = document.createElement('div');
        errorDiv.style.padding = '2rem';
        errorDiv.style.textAlign = 'center';
        const errorHeading = document.createElement('h1');
        errorHeading.textContent = 'Пользователь не найден';
        errorDiv.appendChild(errorHeading);
        mainContent.appendChild(errorDiv);
        return;
      }
      const profileUser = await userRes.json();
      window.profileUserId = profileUser.id; // Сохраняем ID для использования в обработчиках вкладок
      
      // Загружаем статистику этого пользователя
      await loadGameStats(profileUsername);
      
      // Загружаем прогресс по задачам этого пользователя
      await loadPuzzlesProgress(profileUser.id);
      
      // Обновляем hero section
      if (typeof window.updateHeroSection === 'function') {
        window.updateHeroSection(profileUser);
      }
      
      // Обновляем количество решенных задач в hero section
      if (currentPuzzleStats && typeof document !== 'undefined') {
        const puzzlesSolvedHero = document.getElementById('puzzlesSolvedHero');
        if (puzzlesSolvedHero) {
          puzzlesSolvedHero.textContent = currentPuzzleStats.solved_count || 0;
        }
      }
      
      // Загружаем текущего пользователя для проверки дружбы
      // Кнопка дружбы показывается только для авторизованных пользователей
      if (typeof window.apiFetch === 'function') {
        try {
          const meRes = await window.apiFetch('/api/auth/me');
          if (meRes.ok) {
            currentUser = await meRes.json();
            // Инициализируем кнопку дружбы только если это не свой профиль
            if (currentUser && currentUser.id !== profileUser.id) {
              await initFriendshipButton(profileUser.id);
            }
          }
          // Если не авторизован, кнопка не показывается (container.style.display = 'none' по умолчанию)
        } catch (e) {
          console.error('Failed to load current user:', e);
          // Если ошибка авторизации, кнопка не показывается
        }
      }
      
      // НЕ загружаем историю партий при инициализации - только при клике на вкладку
      
      // Загружаем заявки и друзей, если это свой профиль и соответствующие вкладки активны
      const friendRequestsSection = document.getElementById('friendRequests');
      const friendRequestsNavItem = document.querySelector('.sidebar-item[data-section="friendRequests"]');
      
      if (currentUser && currentUser.id === profileUser.id) {
        if (friendRequestsSection && friendRequestsSection.classList.contains('active')) {
          await loadFriendRequests();
        }
        
        const friendsSection = document.getElementById('friends');
        if (friendsSection && friendsSection.classList.contains('active')) {
          await loadFriendsList();
          initFriendsSearch();
        }
        
        if (friendRequestsSection) friendRequestsSection.style.removeProperty('display');
        if (friendRequestsNavItem) friendRequestsNavItem.style.removeProperty('display');
      } else {
        if (friendRequestsSection) friendRequestsSection.style.display = 'none';
        if (friendRequestsNavItem) friendRequestsNavItem.style.display = 'none';
      }
      
      // Обновляем заголовок страницы
      document.title = `${profileUser.username} — PowerChess`;
      
      return;
    }
    
    // Проверяем наличие apiFetch
    if (typeof window.apiFetch !== 'function') {
      console.error('apiFetch не доступен. Убедитесь, что auth.js загружен.');
      renderHistoryAuthPrompt();
      return;
    }
    
    // Иначе загружаем свой профиль
    const meRes = await window.apiFetch('/api/auth/me');
    if (!meRes.ok) {
      renderHistoryAuthPrompt();
      return;
    }
    currentUser = await meRes.json();
    window.profileUserId = null; // Сбрасываем, так как это свой профиль

    // Загружаем статистику игр
    await loadGameStats();

    // Загружаем прогресс по задачам (для своего профиля по умолчанию)
    await loadPuzzlesProgress();
    
    // Обновляем hero section
    if (typeof window.updateHeroSection === 'function') {
      window.updateHeroSection(currentUser);
    }
    
    // Обновляем количество решенных задач в hero section
    if (currentPuzzleStats && typeof document !== 'undefined') {
      const puzzlesSolvedHero = document.getElementById('puzzlesSolvedHero');
      if (puzzlesSolvedHero) {
        puzzlesSolvedHero.textContent = currentPuzzleStats.solved_count || 0;
      }
    }
    
    // НЕ загружаем историю партий при инициализации - только при клике на вкладку
    
    // Загружаем заявки, если вкладка "Заявки в друзья" активна
    const friendRequestsSection = document.getElementById('friendRequests');
    if (friendRequestsSection && friendRequestsSection.classList.contains('active')) {
      await loadFriendRequests();
    }
    
    // Загружаем друзей, если вкладка "Друзья" активна
    const friendsSection = document.getElementById('friends');
    if (friendsSection && friendsSection.classList.contains('active')) {
      await loadFriendsList();
      initFriendsSearch();
    }

    const [allRes, mineRes] = await Promise.all([window.apiFetch('/api/courses/'), window.apiFetch('/api/courses/me')]);
    if (!allRes.ok) return;

    const all = await allRes.json();
    const mine = mineRes.ok ? await mineRes.json() : [];
    const ownedIds = new Set((mine || []).map((c) => c.id));

    const ownedContainer = document.getElementById('myCoursesList');
    const lockedContainer = document.getElementById('lockedCoursesList');
    if (!ownedContainer || !lockedContainer) return;

    ownedContainer.innerHTML = '';
    lockedContainer.innerHTML = '';

    if (mine && mine.length) {
      mine.forEach((c) => ownedContainer.appendChild(createCourseCard(c, true)));
    } else {
      renderEmptyState(ownedContainer, 'Пока нет приобретённых курсов');
    }

    const locked = (all || []).filter((c) => !ownedIds.has(c.id));
    if (locked.length) {
      locked.forEach((c) => lockedContainer.appendChild(createCourseCard(c, false)));
    } else {
      renderEmptyState(lockedContainer, 'Нет недоступных курсов');
    }
  } catch (e) {
    console.error('Cabinet load failed:', e);
  }
});


