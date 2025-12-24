// Games Lobby - Lobby and TV games
(() => {
  let allWaitingGames = [];
  let currentLobbyFilter = 'all';

  async function loadWaitingRoomGames() {
    if (typeof window.showLobbyLoading === 'function') {
      window.showLobbyLoading();
    }
    
    try {
      const res = await window.authedFetch('/api/games/?status=CREATED&limit=50');
      if (!res.ok) throw new Error('Failed to load games');
      const games = await res.json();
      
      const waitingRoom = document.getElementById('waitingRoom');
      if (!waitingRoom) {
        if (typeof window.hideLobbyLoading === 'function') {
          window.hideLobbyLoading();
        }
        return;
      }
      
      allWaitingGames = (games || []).filter(game => {
        // Проверяем наличие обоих игроков (учитывая user_id и session_id)
        const metadata = game.metadata || {};
        const hasWhite = game.white_id || metadata.white_session_id;
        const hasBlack = game.black_id || metadata.black_session_id;
        return !(hasWhite && hasBlack);
      });
      
      // Загружаем имена игроков для всех игр
      if (typeof window.ensureUsernamesForGames === 'function') {
        await window.ensureUsernamesForGames(allWaitingGames);
      }
      
      if (allWaitingGames.length === 0) {
        if (typeof window.showLobbyEmpty === 'function') {
          window.showLobbyEmpty();
        } else {
          waitingRoom.innerHTML = '<div class="empty-state">Нет партий в ожидании. Создайте свою!</div>';
        }
        return;
      }
      
      filterLobbyGames(currentLobbyFilter);
    } catch (err) {
      const waitingRoom = document.getElementById('waitingRoom');
      if (waitingRoom) {
        if (typeof window.showLobbyEmpty === 'function') {
          window.showLobbyEmpty();
        } else {
          waitingRoom.innerHTML = '<div class="empty-state">Ошибка загрузки партий</div>';
        }
      }
    } finally {
      if (typeof window.hideLobbyLoading === 'function') {
        window.hideLobbyLoading();
      }
    }
  }

  function filterLobbyGames(filter) {
    currentLobbyFilter = filter;
    const waitingRoom = document.getElementById('waitingRoom');
    if (!waitingRoom) return;
    
    let filteredGames = allWaitingGames;
    
    if (filter === 'rated') {
      filteredGames = allWaitingGames.filter(game => game.metadata?.rated === true);
    } else if (filter === 'casual') {
      filteredGames = allWaitingGames.filter(game => !game.metadata?.rated);
    }
    
    if (filteredGames.length === 0) {
      if (typeof window.showLobbyEmpty === 'function') {
        window.showLobbyEmpty();
      } else {
        waitingRoom.innerHTML = '<div class="empty-state">Нет партий с выбранным фильтром</div>';
      }
      return;
    }
    
    if (typeof window.showLobbyContent === 'function') {
      window.showLobbyContent();
    }
    
    waitingRoom.innerHTML = '';
    filteredGames.forEach(game => {
      // Проверяем наличие обоих игроков (учитывая user_id и session_id)
      const metadata = game.metadata || {};
      const hasWhite = game.white_id || metadata.white_session_id;
      const hasBlack = game.black_id || metadata.black_session_id;
      if (hasWhite && hasBlack) return;
      
      const item = document.createElement('div');
      item.className = 'waiting-item';
      
      const timeControl = game.time_control || {};
      const minutes = Math.round((timeControl.initial_ms || 0) / 60000);
      const increment = Math.round((timeControl.increment_ms || 0) / 1000);
      const timeStr = `${minutes}+${increment}`;
      const rated = game.metadata?.rated ? 'Рейтинговая' : 'Товарищеская';
      
      // Используем getPlayerName для правильного отображения имен
      const whitePlayer = window.getPlayerName ? window.getPlayerName(game, 'white') : (game.white_id ? `ID ${game.white_id}` : 'Ожидает белых');
      const blackPlayer = window.getPlayerName ? window.getPlayerName(game, 'black') : (game.black_id ? `ID ${game.black_id}` : 'Ожидает чёрных');
      
      // Если игрок не присоединился, показываем "Ожидает..."
      const whiteDisplay = hasWhite ? whitePlayer : 'Ожидает белых';
      const blackDisplay = hasBlack ? blackPlayer : 'Ожидает чёрных';
      
      // Создаем структуру через DOM API для безопасности
      const waitingInfo = document.createElement('div');
      waitingInfo.className = 'waiting-info';
      
      const playerDiv = document.createElement('div');
      playerDiv.className = 'waiting-player';
      playerDiv.textContent = `${whiteDisplay} vs ${blackDisplay}`;
      
      const timeDiv = document.createElement('div');
      timeDiv.className = 'waiting-time';
      timeDiv.textContent = `${timeStr} • ${rated}`;
      
      waitingInfo.appendChild(playerDiv);
      waitingInfo.appendChild(timeDiv);
      
      const joinBtn = document.createElement('button');
      joinBtn.className = 'btn-join';
      joinBtn.setAttribute('data-game-id', game.id.toString());
      joinBtn.textContent = 'Принять';
      
      item.appendChild(waitingInfo);
      item.appendChild(joinBtn);
      
      joinBtn.addEventListener('click', async () => {
        await joinWaitingGame(game.id);
      });
      
      waitingRoom.appendChild(item);
    });
  }

  async function loadTVGames() {
    if (typeof window.showTVLoading === 'function') {
      window.showTVLoading();
    }
    
    try {
      const res = await window.authedFetch('/api/games/?status=ACTIVE&limit=50');
      if (!res.ok) throw new Error('Failed to load games');
      const games = await res.json();
      
      const tvGames = document.getElementById('tvGames');
      if (!tvGames) {
        if (typeof window.hideTVLoading === 'function') {
          window.hideTVLoading();
        }
        return;
      }
      
      // Фильтруем на клиенте:
      // 1. Проверяем наличие обоих игроков
      // 2. Исключаем завершенные партии (временная защита, пока бэкенд не фильтрует по status)
      // ПРОБЛЕМА: Бэкенд не обрабатывает параметр ?status=ACTIVE в /api/games/
      // Watchdog обновляет статус каждые 15 секунд, поэтому может быть задержка
      const activeGames = (games || []).filter(game => {
        // Исключаем завершенные партии
        if (game.status === 'FINISHED' || game.finished_at || game.termination_reason) {
          return false;
        }
        
        // Проверяем наличие обоих игроков
        return game.status === 'ACTIVE' &&
               (game.white_id || game.metadata?.white_session_id) && 
               (game.black_id || game.metadata?.black_session_id);
      });
      
      if (activeGames.length === 0) {
        if (typeof window.showTVEmpty === 'function') {
          window.showTVEmpty();
        } else {
          tvGames.innerHTML = '<div class="empty-state">Пока нет активных матчей.</div>';
        }
        return;
      }
      
      // Загружаем имена игроков для всех игр
      if (typeof window.ensureUsernamesForGames === 'function') {
        await window.ensureUsernamesForGames(activeGames);
      }
      
      if (typeof window.showTVContent === 'function') {
        window.showTVContent();
      }
      
      tvGames.innerHTML = '';
      
      activeGames.forEach(game => {
        const item = document.createElement('div');
        item.className = 'tv-game';
        item.dataset.gameId = game.id;
        
        const timeControl = game.time_control || {};
        const minutes = Math.round((timeControl.initial_ms || 0) / 60000);
        const increment = Math.round((timeControl.increment_ms || 0) / 1000);
        const timeStr = `${minutes}+${increment}`;
        const whitePlayer = window.getPlayerName ? window.getPlayerName(game, 'white') : '—';
        const blackPlayer = window.getPlayerName ? window.getPlayerName(game, 'black') : '—';
        
        // Создаем структуру через DOM API для безопасности
        const liveBadge = document.createElement('div');
        liveBadge.className = 'tv-live-badge';
        const liveDot = document.createElement('div');
        liveDot.className = 'live-dot';
        liveBadge.appendChild(liveDot);
        liveBadge.appendChild(document.createTextNode(' LIVE'));
        
        const playersDiv = document.createElement('div');
        playersDiv.className = 'tv-players';
        
        const whitePlayerDiv = document.createElement('div');
        whitePlayerDiv.className = 'tv-player';
        whitePlayerDiv.textContent = `⚪ ${whitePlayer}`;
        
        const blackPlayerDiv = document.createElement('div');
        blackPlayerDiv.className = 'tv-player';
        blackPlayerDiv.textContent = `⚫ ${blackPlayer}`;
        
        playersDiv.appendChild(whitePlayerDiv);
        playersDiv.appendChild(blackPlayerDiv);
        
        const timeDiv = document.createElement('div');
        timeDiv.className = 'tv-time';
        timeDiv.textContent = `${timeStr} • Ход ${game.move_count || 0}`;
        
        item.appendChild(liveBadge);
        item.appendChild(playersDiv);
        item.appendChild(timeDiv);
        
        item.addEventListener('click', () => {
          window.location.href = `/match/${game.id}`;
        });
        
        tvGames.appendChild(item);
      });
    } catch (err) {
      const tvGames = document.getElementById('tvGames');
      if (tvGames) {
        if (typeof window.showTVEmpty === 'function') {
          window.showTVEmpty();
        } else {
          tvGames.innerHTML = '<div class="empty-state">Ошибка загрузки партий</div>';
        }
      }
    } finally {
      if (typeof window.hideTVLoading === 'function') {
        window.hideTVLoading();
      }
    }
  }

  async function joinWaitingGame(gameId) {
    const token = window.getAccessToken ? window.getAccessToken() : '';
    if (!token) {
      if (window.showToast) window.showToast('Войдите в аккаунт, чтобы присоединиться', 'error');
      window.location.href = '/login';
      return;
    }
    
    try {
      const res = await window.authedFetch(`/api/games/${gameId}/join`, {
        method: 'POST'
      });
      
      if (!res.ok) {
        let errorText = 'Не удалось присоединиться';
        try {
          const errorData = await res.json();
          errorText = errorData.detail || errorData.message || errorText;
        } catch {
          const text = await res.text();
          errorText = text || errorText;
        }
        throw new Error(errorText);
      }
      
      const game = await res.json();
      if (window.showToast) window.showToast('Вы присоединились к партии!');
      
      if (game && game.id) {
        window.location.href = `/match/${game.id}`;
      }
    } catch (err) {
      if (window.showToast) window.showToast('Не удалось присоединиться: ' + (err.message || ''), 'error');
    }
  }

  // Export functions
  window.loadWaitingRoomGames = loadWaitingRoomGames;
  window.loadWaitingGames = loadWaitingRoomGames;
  window.loadTVGames = loadTVGames;
  window.joinWaitingGame = joinWaitingGame;
  window.filterLobbyGames = filterLobbyGames;
})();
