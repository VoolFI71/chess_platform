// Populate cabinet

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
    
    // Создаем структуру через DOM API для безопасности
    const header = document.createElement('div');
    header.className = 'theme-stat-header';
    
    const nameDiv = document.createElement('div');
    nameDiv.className = 'theme-stat-name';
    nameDiv.textContent = theme.theme || '';
    
    const accuracyDiv = document.createElement('div');
    accuracyDiv.className = 'theme-stat-accuracy';
    accuracyDiv.textContent = `${theme.accuracy || 0}%`;
    
    header.appendChild(nameDiv);
    header.appendChild(accuracyDiv);
    
    const progress = document.createElement('div');
    progress.className = 'theme-stat-progress';
    
    const progressBarWrapper = document.createElement('div');
    progressBarWrapper.className = 'progress-bar-wrapper';
    
    const progressBarFill = document.createElement('div');
    progressBarFill.className = 'progress-bar-fill';
    progressBarFill.style.width = `${progressPercent}%`;
    
    progressBarWrapper.appendChild(progressBarFill);
    
    const numbers = document.createElement('div');
    numbers.className = 'theme-stat-numbers';
    const numbersSpan = document.createElement('span');
    numbersSpan.textContent = `${theme.solved || 0} / ${theme.total || 0}`;
    numbers.appendChild(numbersSpan);
    
    progress.appendChild(progressBarWrapper);
    progress.appendChild(numbers);
    
    themeCard.appendChild(header);
    themeCard.appendChild(progress);
    
    container.appendChild(themeCard);
  });
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
    
    // Получаем изменение рейтинга из metadata игры
    let ratingChangeValue = null;
    
    if (color && game.metadata) {
      try {
        // metadata может быть объектом или строкой JSON
        const metadata = typeof game.metadata === 'string' 
          ? JSON.parse(game.metadata) 
          : game.metadata;
        
        // Проверяем, является ли игра рейтинговой
        const isRated = metadata?.rated === true;
        
        if (isRated) {
          // Получаем изменение рейтинга в зависимости от цвета игрока
          if (color === 'white' && metadata.white_rating_change !== undefined) {
            ratingChangeValue = metadata.white_rating_change;
          } else if (color === 'black' && metadata.black_rating_change !== undefined) {
            ratingChangeValue = metadata.black_rating_change;
          }
        }
      } catch (e) {
        }
    }
    
    // Форматируем изменение рейтинга для отображения
    if (ratingChangeValue !== null) {
      ratingChange = ratingChangeValue > 0 
        ? `+${ratingChangeValue}` 
        : ratingChangeValue.toString();
    } else {
      // Если изменение рейтинга не найдено или игра не рейтинговая, показываем пусто
      ratingChange = '';
    }
    
    if (result.className === 'win') {
      iconClass = 'fas fa-check';
      iconStyle = 'success';
    } else if (result.className === 'loss') {
      iconClass = 'fas fa-times';
      iconStyle = 'danger';
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
    timeDiv.textContent = timeControl;
    if (ratingChange && ratingChangeValue !== null) {
      const ratingColor = ratingChangeValue > 0 ? 'success' : ratingChangeValue < 0 ? 'danger' : 'warning';
      const ratingText = document.createTextNode(' | Рейтинг: ');
      const ratingSpan = document.createElement('span');
      ratingSpan.style.color = `var(--${ratingColor})`;
      ratingSpan.style.fontWeight = '600';
      ratingSpan.textContent = ratingChange;
      timeDiv.appendChild(ratingText);
      timeDiv.appendChild(ratingSpan);
    }
    timeDiv.appendChild(document.createTextNode(` | ${matchDate}`));
    
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

// (Friends feature removed)

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
      
      // Загружаем текущего пользователя
      if (typeof window.apiFetch === 'function') {
        try {
          const meRes = await window.apiFetch('/api/auth/me');
          if (meRes.ok) {
            currentUser = await meRes.json();
          }
        } catch (e) {
          // Если ошибка авторизации
        }
      }
      
      // НЕ загружаем историю партий при инициализации - только при клике на вкладку
      
      // Обновляем заголовок страницы
      document.title = `${profileUser.username} — ChessMint`;
      
      return;
    }
    
    // Проверяем наличие apiFetch
    if (typeof window.apiFetch !== 'function') {
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
  } catch (e) {
    }
});


