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
    card.className = 'history-card';

    const result = describeResult(game);
    const color = getPlayerColor(game);
    const colorLabel = color === 'white' ? 'Белыми' : color === 'black' ? 'Чёрными' : '—';
    const opponent = getOpponentId(game);
    const termination = describeTermination(game.termination_reason);
    const matchDate = formatDate(game.finished_at || game.started_at || game.created_at);

    // Создаем элементы безопасным способом
    const topDiv = document.createElement('div');
    topDiv.className = 'history-card-top';
    
    const resultDiv = document.createElement('div');
    resultDiv.className = `history-result ${result.className}`;
    const resultIcon = document.createElement('i');
    resultIcon.className = 'fas fa-flag-checkered';
    resultDiv.appendChild(resultIcon);
    const resultText = document.createTextNode(` ${result.label}`);
    resultDiv.appendChild(resultText);
    
    const dateDiv = document.createElement('div');
    dateDiv.className = 'history-date';
    dateDiv.textContent = matchDate;
    
    topDiv.appendChild(resultDiv);
    topDiv.appendChild(dateDiv);
    
    const playersDiv = document.createElement('div');
    playersDiv.className = 'history-players';
    
    const colorPill = document.createElement('span');
    colorPill.className = `color-pill ${color || ''}`;
    colorPill.textContent = colorLabel;
    
    const againstSpan = document.createElement('span');
    againstSpan.style.opacity = '0.6';
    againstSpan.textContent = 'против';
    
    const opponentSpan = document.createElement('span');
    opponentSpan.className = 'opponent-name';
    opponentSpan.textContent = playerLabel(opponent);
    
    playersDiv.appendChild(colorPill);
    playersDiv.appendChild(againstSpan);
    playersDiv.appendChild(opponentSpan);
    
    const metaDiv = document.createElement('div');
    metaDiv.className = 'history-meta';
    
    const timeControlSpan = document.createElement('span');
    const timeControlIcon = document.createElement('i');
    timeControlIcon.className = 'fas fa-stopwatch';
    timeControlSpan.appendChild(timeControlIcon);
    timeControlSpan.appendChild(document.createTextNode(` ${describeTimeControl(game.time_control)}`));
    
    const moveCountSpan = document.createElement('span');
    const moveCountIcon = document.createElement('i');
    moveCountIcon.className = 'fas fa-list-ol';
    moveCountSpan.appendChild(moveCountIcon);
    moveCountSpan.appendChild(document.createTextNode(` Ходов: ${game.move_count || 0}`));
    
    const statusSpan = document.createElement('span');
    const statusIcon = document.createElement('i');
    statusIcon.className = 'fas fa-info-circle';
    statusSpan.appendChild(statusIcon);
    statusSpan.appendChild(document.createTextNode(` ${translateStatus(game.status)}`));
    
    metaDiv.appendChild(timeControlSpan);
    metaDiv.appendChild(moveCountSpan);
    metaDiv.appendChild(statusSpan);
    
    if (termination) {
      const terminationSpan = document.createElement('span');
      const terminationIcon = document.createElement('i');
      terminationIcon.className = 'fas fa-skull-crossbones';
      terminationSpan.appendChild(terminationIcon);
      terminationSpan.appendChild(document.createTextNode(` ${termination}`));
      metaDiv.appendChild(terminationSpan);
    }
    
    const actionsDiv = document.createElement('div');
    actionsDiv.className = 'history-actions';
    
    const viewBtn = document.createElement('button');
    viewBtn.className = 'btn btn-primary';
    viewBtn.type = 'button';
    viewBtn.onclick = () => { window.location.href = `/match/${game.id}`; };
    const viewIcon = document.createElement('i');
    viewIcon.className = 'fas fa-eye';
    viewBtn.appendChild(viewIcon);
    viewBtn.appendChild(document.createTextNode(' Смотреть партию'));
    
    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-outline';
    copyBtn.type = 'button';
    copyBtn.onclick = () => { 
      if (window.copyMatchLink) {
        window.copyMatchLink(game.id);
      }
    };
    const copyIcon = document.createElement('i');
    copyIcon.className = 'fas fa-link';
    copyBtn.appendChild(copyIcon);
    copyBtn.appendChild(document.createTextNode(' Скопировать ссылку'));
    
    actionsDiv.appendChild(viewBtn);
    actionsDiv.appendChild(copyBtn);
    
    card.appendChild(topDiv);
    card.appendChild(playersDiv);
    card.appendChild(metaDiv);
    card.appendChild(actionsDiv);

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
    
    // Вычисляем средний рейтинг (взвешенный по количеству партий)
    let totalRating = 0;
    let totalWeight = 0;
    if (stats.by_format && stats.by_format.length > 0) {
      stats.by_format.forEach(fmt => {
        const weight = fmt.games_played;
        let rating = 0;
        if (fmt.format === 'bullet') rating = stats.bullet_rating || 1200;
        else if (fmt.format === 'blitz') rating = stats.blitz_rating || 1200;
        else if (fmt.format === 'rapid') rating = stats.rapid_rating || 1200;
        else if (fmt.format === 'classical') rating = stats.rapid_rating || 1200;
        
        totalRating += rating * weight;
        totalWeight += weight;
      });
    }
    const avgRating = totalWeight > 0 ? Math.round(totalRating / totalWeight) : (stats.blitz_rating || stats.bullet_rating || stats.rapid_rating || 1200);
    if (overallRatingEl) overallRatingEl.textContent = avgRating;
    
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
      
      // Загружаем статистику этого пользователя
      await loadGameStats(profileUsername);
      
      // НЕ загружаем историю партий при инициализации - только при клике на вкладку
      
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

    // Загружаем статистику игр
    await loadGameStats();
    
    // НЕ загружаем историю партий при инициализации - только при клике на вкладку

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


