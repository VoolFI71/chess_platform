// Games UI - Rendering functions
(() => {
  const state = window.getGamesState();

  function renderCollections() {
    renderGameCollection('waitingList', state.waitingGames, 'waiting');
    renderGameCollection('liveList', state.liveGames, 'live');
    highlightSelectedCard();
  }

  function renderGameCollection(containerId, games, view) {
    const container = document.getElementById(containerId);
    if (!container) return;

    if (!games.length) {
      container.textContent = '';
      const emptyState = document.createElement('div');
      emptyState.className = 'empty-state';
      emptyState.textContent = view === 'waiting' ? 'Ни одной партии в ожидании. Создайте свою!' : 'Пока нет активных матчей.';
      container.appendChild(emptyState);
      return;
    }

    container.innerHTML = '';
    games.forEach((game) => {
      const card = document.createElement('div');
      card.className = `game-card${state.selectedGameId === game.id ? ' selected' : ''}`;
      card.dataset.gameId = game.id;
      // Создаем структуру через DOM API для безопасности
      const cardTop = document.createElement('div');
      cardTop.className = 'card-top';
      
      const statusPill = document.createElement('span');
      statusPill.className = `pill ${window.statusClass(game.status)}`;
      statusPill.textContent = window.translateStatus(game.status) || '';
      
      const timeControlSpan = document.createElement('span');
      timeControlSpan.style.fontSize = '0.85rem';
      timeControlSpan.style.color = 'rgba(248,250,252,0.7)';
      timeControlSpan.textContent = window.describeTimeControl(game.time_control) || '';
      
      cardTop.appendChild(statusPill);
      cardTop.appendChild(timeControlSpan);
      
      const playersDiv = document.createElement('div');
      playersDiv.className = 'players';
      const whiteName = window.getPlayerName(game, 'white') || '';
      const blackName = window.getPlayerName(game, 'black') || '';
      playersDiv.textContent = `${whiteName} vs ${blackName}`;
      
      const metaRow = document.createElement('div');
      metaRow.className = 'meta-row';
      
      const movesSpan = document.createElement('span');
      movesSpan.textContent = `Ходы: ${game.move_count || 0}`;
      
      const idSpan = document.createElement('span');
      idSpan.textContent = `ID ${(game.id || '').slice(0, 8)}`;
      
      metaRow.appendChild(movesSpan);
      metaRow.appendChild(idSpan);
      
      const actions = document.createElement('div');
      actions.className = 'actions';
      
      card.appendChild(cardTop);
      card.appendChild(playersDiv);
      card.appendChild(metaRow);
      card.appendChild(actions);

      const openBtn = document.createElement('button');
      openBtn.className = 'btn-outline';
      openBtn.textContent = 'Открыть';
      openBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        window.location.href = `/match/${game.id}`;
      });
      actions.appendChild(openBtn);

      const openSeat = window.getAvailableSeat(game);
      if (view === 'waiting' && canJoinGame(game) && openSeat) {
        const joinBtn = document.createElement('button');
        joinBtn.className = 'btn-primary';
        joinBtn.textContent = openSeat === 'white' ? 'Играть за белых' : 'Играть за чёрных';
        joinBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          window.selectGame(game.id).then(() => window.joinGame());
        });
        actions.appendChild(joinBtn);
      }

      card.addEventListener('click', () => window.selectGame(game.id));
      container.appendChild(card);
    });
  }

  function canJoinGame(game) {
    if (!state.currentUser) return false;
    if (game.status !== 'CREATED') return false;
    if (state.currentUser.id === game.white_id || state.currentUser.id === game.black_id) return false;
    return window.getAvailableSeat(game) !== null;
  }

  const highlightSelectedCard = () => {
    document.querySelectorAll('.game-card').forEach((card) => {
      card.classList.toggle('selected', card.dataset.gameId === state.selectedGameId);
    });
  };

  async function selectGame(gameId) {
    if (!gameId) return;
    if (state.selectedGameId === gameId && state.selectedGame) {
      highlightSelectedCard();
      return;
    }
    state.selectedGameId = gameId;
    highlightSelectedCard();
    window.history.replaceState({}, '', `?game=${encodeURIComponent(gameId)}`);
    await loadGameDetail(gameId);
  }

  async function loadGameDetail(gameId) {
    const panel = document.getElementById('gameDetailPanel');
    const placeholder = document.getElementById('gameDetailEmpty');
    if (placeholder) placeholder.textContent = 'Загружаем данные партии...';
    if (panel) panel.classList.add('hidden');

    try {
      const buildUrl = (path) => {
        if (!path) return '';
        if (path.startsWith('http://') || path.startsWith('https://')) return path;
        return path;
      };
      const res = await fetch(buildUrl(`/api/games/${gameId}?moves_limit=200`));
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      state.selectedGame = detail;
      state.moves = detail.moves || [];
      
      let lastStateTimestamp = Date.now();
      if (detail.moves && detail.moves.length > 0) {
        const lastMove = detail.moves[detail.moves.length - 1];
        if (lastMove.created_at) {
          lastStateTimestamp = new Date(lastMove.created_at).getTime();
        }
      } else if (detail.started_at) {
        lastStateTimestamp = new Date(detail.started_at).getTime();
      } else if (detail.created_at) {
        lastStateTimestamp = new Date(detail.created_at).getTime();
      }
      state.lastStateTimestamp = lastStateTimestamp;
      
      if (window.ensureUsernamesForGames) await window.ensureUsernamesForGames([detail]);
      renderGameDetail();
      if (window.connectWebSocket) window.connectWebSocket(gameId);
    } catch (err) {
      if (window.showToast) window.showToast('Не удалось загрузить детали партии', 'error');
      if (placeholder) placeholder.textContent = 'Произошла ошибка при загрузке данных.';
    }
  }

  function renderGameDetail() {
    const panel = document.getElementById('gameDetailPanel');
    const placeholder = document.getElementById('gameDetailEmpty');
    if (!state.selectedGame) {
      if (panel) panel.classList.add('hidden');
      if (placeholder) placeholder.classList.remove('hidden');
      return;
    }

    if (panel) panel.classList.remove('hidden');
    if (placeholder) placeholder.classList.add('hidden');

    document.getElementById('detailTitle').textContent = `Партия #${state.selectedGame.move_count}`;
    document.getElementById('gameIdField').value = state.selectedGame.id;
    const badge = document.getElementById('gameStatusBadge');
    if (badge) {
      badge.textContent = window.translateStatus(state.selectedGame.status);
      badge.className = `pill ${window.statusClass(state.selectedGame.status)}`;
    }
    document.getElementById('gameTimeControl').textContent = window.describeTimeControl(state.selectedGame.time_control);
    document.getElementById('gameResult').textContent = state.selectedGame.result || '—';
    document.getElementById('whitePlayerLabel').textContent = window.getPlayerName(state.selectedGame, 'white');
    document.getElementById('blackPlayerLabel').textContent = window.getPlayerName(state.selectedGame, 'black');

    renderMoves();
    renderActions();
    if (window.updateClockDisplays) window.updateClockDisplays(true);
  }

  function renderMoves() {
    const list = document.getElementById('movesList');
    if (!list) return;
    list.textContent = '';
    if (!state.moves.length) {
      const emptyItem = document.createElement('li');
      emptyItem.style.justifyContent = 'center';
      emptyItem.style.color = 'rgba(148,163,184,.7)';
      emptyItem.textContent = 'Ходов пока нет';
      list.appendChild(emptyItem);
      return;
    }
    state.moves.forEach((move) => {
      const row = document.createElement('li');
      
      const moveIndexSpan = document.createElement('span');
      moveIndexSpan.textContent = `#${move.move_index || ''}`;
      
      const moveSpan = document.createElement('span');
      moveSpan.textContent = move.san || move.uci || '';
      
      const playerSpan = document.createElement('span');
      playerSpan.style.fontSize = '0.8rem';
      playerSpan.style.color = 'rgba(148,163,184,.8)';
      playerSpan.textContent = move.player_id ? `ID ${move.player_id}` : '—';
      
      row.appendChild(moveIndexSpan);
      row.appendChild(moveSpan);
      row.appendChild(playerSpan);
      list.appendChild(row);
    });
    list.scrollTop = list.scrollHeight;
  }

  function renderActions() {
    const container = document.getElementById('gameActions');
    if (!container || !state.selectedGame) return;
    container.innerHTML = '';

    const openSeat = window.getAvailableSeat(state.selectedGame);
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn-primary';
    joinBtn.textContent =
      openSeat === 'white'
        ? 'Присоединиться белыми'
        : openSeat === 'black'
          ? 'Присоединиться чёрными'
          : 'Присоединиться';
    joinBtn.addEventListener('click', window.joinGame);

    const resignBtn = document.createElement('button');
    resignBtn.className = 'btn-danger';
    resignBtn.textContent = 'Сдаться';
    resignBtn.addEventListener('click', window.resignGame);

    const flagBtn = document.createElement('button');
    flagBtn.className = 'btn-outline';
    flagBtn.textContent = 'Заявить флаг соперника';
    flagBtn.addEventListener('click', window.declareTimeout);

    const copyLinkBtn = document.createElement('button');
    copyLinkBtn.className = 'btn-outline';
    copyLinkBtn.textContent = 'Скопировать ссылку';
    copyLinkBtn.addEventListener('click', window.copyShareLink);

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn-outline';
    refreshBtn.textContent = 'Обновить';
    refreshBtn.addEventListener('click', () => loadGameDetail(state.selectedGame.id));

    if (canJoinCurrentGame()) container.appendChild(joinBtn);

    const role = getCurrentUserRole();
    if (role && state.selectedGame.status === 'ACTIVE') {
      container.appendChild(resignBtn);
      if (canDeclareTimeout(role)) container.appendChild(flagBtn);
    }

    container.appendChild(copyLinkBtn);
    container.appendChild(refreshBtn);
  }

  const canJoinCurrentGame = () => {
    if (!state.currentUser || !state.selectedGame) return false;
    if (state.selectedGame.status !== 'CREATED') return false;
    if (
      state.currentUser.id === state.selectedGame.white_id ||
      state.currentUser.id === state.selectedGame.black_id
    ) {
      return false;
    }
    return window.getAvailableSeat(state.selectedGame) !== null;
  };

  const getCurrentUserRole = () => {
    if (!state.currentUser || !state.selectedGame) return null;
    if (state.currentUser.id === state.selectedGame.white_id) return 'white';
    if (state.currentUser.id === state.selectedGame.black_id) return 'black';
    return null;
  };

  const canDeclareTimeout = (role) => {
    const clocks = window.getDisplayedClocks ? window.getDisplayedClocks(false) : null;
    if (!clocks) return false;
    if (role === 'white') return clocks.black <= 0;
    if (role === 'black') return clocks.white <= 0;
    return false;
  };

  function updateHeroStats() {
    const waiting = document.getElementById('statWaiting');
    const live = document.getElementById('statLive');
    const finished = document.getElementById('statFinished');
    if (waiting) waiting.textContent = state.waitingGames.length;
    if (live) live.textContent = state.liveGames.length;
    if (finished) finished.textContent = state.finishedGames.length;
  }

  // Export functions
  window.renderCollections = renderCollections;
  window.renderGameCollection = renderGameCollection;
  window.highlightSelectedCard = highlightSelectedCard;
  window.selectGame = selectGame;
  window.loadGameDetail = loadGameDetail;
  window.renderGameDetail = renderGameDetail;
  window.renderMoves = renderMoves;
  window.renderActions = renderActions;
  window.updateHeroStats = updateHeroStats;
  window.getCurrentUserRole = getCurrentUserRole;
})();
