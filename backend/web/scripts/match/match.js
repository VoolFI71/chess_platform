(() => {
  const MatchConstants = window.MatchConstants;
  if (!MatchConstants) {
    throw new Error('MatchConstants module is not loaded. Ensure match.constants.js is included before match.js');
  }
  const {
    DEFAULT_FEN,
    PIECES,
    FILES,
    RANKS,
    AUTH_CLOSE_CODES,
  } = MatchConstants;

  const MatchUtils = window.MatchUtils;
  if (!MatchUtils) {
    throw new Error('MatchUtils module is not loaded. Ensure match.utils.js is included before match.js');
  }
  const {
    translateStatus,
    statusClass,
    describeTimeControl,
    formatClock,
    getRoleLabel: utilsGetRoleLabel,
    titleName: utilsTitleName,
    describeWinner: utilsDescribeWinner,
  } = MatchUtils;

  const MatchTimers = window.MatchTimers;
  if (!MatchTimers) {
    throw new Error('MatchTimers module is not loaded. Ensure match.timers.js is included before match.js');
  }
  const {
    clearWsReconnectTimer: timersClearWsReconnectTimer,
    resetWsRetryState: timersResetWsRetryState,
    scheduleWsReconnect: timersScheduleWsReconnect,
  } = MatchTimers;

  const MatchPlayerNamesUtils = window.MatchPlayerNamesUtils;
  if (!MatchPlayerNamesUtils) {
    throw new Error('MatchPlayerNamesUtils module is not loaded. Ensure match.player-names.js is included before match.js');
  }
  const {
    fetchUsername: playerNamesFetchUsername,
    ensurePlayerUsernames: playerNamesEnsurePlayerUsernames,
  } = MatchPlayerNamesUtils;

  const matchStateModule = window.MatchState;
  if (!matchStateModule) {
    throw new Error('MatchState module is not loaded. Ensure match.state.js is included before match.js');
  }
  const { state, setState, haveBothPlayersJoined, getCurrentUserRole } = matchStateModule;

  const matchApiModule = window.MatchApi;
  if (!matchApiModule) {
    throw new Error('MatchApi module is not loaded. Ensure match.api.js is included before match.js');
  }
  const {
    buildUrl,
    authedFetch,
    getAccessToken,
    clearTokens,
    refreshAccessToken,
  } = matchApiModule;

  let isDarkTheme = false;
  let boardOrientation = 'white';
  let userSetOrientation = false;

  const getPanelRoles = () => {
    const bottomRole = boardOrientation === 'white' ? 'white' : 'black';
    const topRole = bottomRole === 'white' ? 'black' : 'white';
    return { topRole, bottomRole };
  };

  const getPlayerIdByRole = (role) => {
    if (!state.game) return null;
    return role === 'white' ? state.game.white_id : state.game.black_id;
  };

  const getRoleLabel = utilsGetRoleLabel;


  function showToast(message, type = 'info') {
    const toast = document.getElementById('gamesToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 4000);
  }

  function clearWsReconnectTimer() {
    timersClearWsReconnectTimer();
  }

  function resetWsRetryState() {
    timersResetWsRetryState();
  }

  function scheduleWsReconnect() {
    timersScheduleWsReconnect(connectWebSocket, showToast);
  }

  function shouldAttemptWsReconnect(event) {
    if (!state.matchId) return false;
    if (!event) return true;
    if (event.code === 1000 || event.code === 1001) return false;
    return true;
  }

  async function handleWsClose(event) {
    updateWsIndicator('offline');
    setState({ ws: null }, 'handleWsClose');
    if (!shouldAttemptWsReconnect(event)) return;

    if (AUTH_CLOSE_CODES.has(event?.code)) {
      const refreshed = await refreshAccessToken();
      if (!refreshed) {
        wsLog('error', 'Failed to refresh access token');
        showToast('Сессия истекла. Войдите снова, чтобы продолжить партию', 'error');
        return;
      }
    }
    scheduleWsReconnect();
  }

  const titleName = utilsTitleName;

  async function fetchUsername(userId) {
    const result = await playerNamesFetchUsername(userId);
    updatePlayerLabelsAndTitle();
    updateWinnerDisplay();
    return result;
  }

  async function ensurePlayerUsernames(game) {
    await playerNamesEnsurePlayerUsernames(game);
    updatePlayerLabelsAndTitle();
  }

  const describeWinner = utilsDescribeWinner;
  // Вспомогательная функция для получения имени игрока по роли
  const getPlayerNameByRole = (role) => {
    if (!state.game) return '—';
    const metadata = state.game.metadata || {};
    const id = role === 'white' ? state.game.white_id : state.game.black_id;
    const sessionId = role === 'white' ? metadata.white_session_id : metadata.black_session_id;
    
    // Если есть user_id, отображаем как обычно
    if (id !== null && id !== undefined) {
      if (state.currentUser && state.currentUser.id === id) {
        return state.currentUser.username ? `Вы (${state.currentUser.username})` : 'Вы';
      }
      return titleName(id);
    }
    
    // Если нет user_id, но есть session_id - это анонимный игрок
    if (sessionId) {
      // Проверяем, является ли текущий пользователь этим анонимным игроком
      if (typeof window.getSessionId === 'function') {
        const currentSessionId = window.getSessionId();
        if (currentSessionId === sessionId) {
          return 'Вы (Гость)';
        }
      }
      return 'Гость';
    }
    
    return '—';
  };

  const labelPlayer = (id) => {
    if (id === null || id === undefined) return '—';
    if (state.currentUser && state.currentUser.id === id) {
      return state.currentUser.username ? `Вы (${state.currentUser.username})` : 'Вы';
    }
    return titleName(id);
  };

  function updateWinnerDisplay() {
    const winnerEl = document.getElementById('gameWinner');
    if (winnerEl) {
      winnerEl.textContent = describeWinner(state.game);
    }
  }

  function updatePlayerLabelsAndTitle() {
    const matchTitle = document.getElementById('matchTitle');
    if (matchTitle) {
      if (state.game) {
        const whiteName = getPlayerNameByRole('white');
        const blackName = getPlayerNameByRole('black');
        matchTitle.textContent = `${whiteName} vs ${blackName}`;
      } else {
        matchTitle.textContent = 'Партия не найдена';
      }
    }

    const whiteLabel = document.getElementById('whitePlayerLabel');
    if (whiteLabel) {
      whiteLabel.textContent = state.game ? getPlayerNameByRole('white') : '—';
    }

    const blackLabel = document.getElementById('blackPlayerLabel');
    if (blackLabel) {
      blackLabel.textContent = state.game ? getPlayerNameByRole('black') : '—';
    }

    const topLabel = document.getElementById('topPlayerLabel');
    const bottomLabel = document.getElementById('bottomPlayerLabel');
    const topColor = document.getElementById('topPlayerColor');
    const bottomColor = document.getElementById('bottomPlayerColor');
    if (topLabel || bottomLabel || topColor || bottomColor) {
      if (!state.game) {
        if (topLabel) topLabel.textContent = '—';
        if (bottomLabel) bottomLabel.textContent = '—';
        if (topColor) topColor.textContent = '—';
        if (bottomColor) bottomColor.textContent = '—';
      } else {
        const { topRole, bottomRole } = getPanelRoles();
        if (topLabel) topLabel.textContent = getPlayerNameByRole(topRole);
        if (bottomLabel) bottomLabel.textContent = getPlayerNameByRole(bottomRole);
        if (topColor) topColor.textContent = getRoleLabel(topRole);
        if (bottomColor) bottomColor.textContent = getRoleLabel(bottomRole);
      }
    }
  }

  const getAvailableSeat = (game) => {
    if (!game) return null;
    
    // Проверяем наличие игроков, включая анонимных через session_id
    const metadata = game.metadata || {};
    const hasWhite = (game.white_id !== null && game.white_id !== undefined) || metadata.white_session_id;
    const hasBlack = (game.black_id !== null && game.black_id !== undefined) || metadata.black_session_id;
    
    if (!hasWhite) return 'white';
    if (!hasBlack) return 'black';
    return null;
  };

  function updateAuthPanel() {
    const info = document.getElementById('gamesUserInfo');
    const infoMobile = document.getElementById('gamesUserInfoMobile');
    const loginBtns = [
      document.getElementById('gamesLoginBtn'),
      document.getElementById('gamesLoginBtnMobile'),
    ];
    const registerBtns = [
      document.getElementById('gamesRegisterBtn'),
      document.getElementById('gamesRegisterBtnMobile'),
    ];
    const logoutBtns = [
      document.getElementById('gamesLogoutBtn'),
      document.getElementById('gamesLogoutBtnMobile'),
    ];
    const userActions = document.getElementById('userActions');
    const authButtons = document.getElementById('authButtons');
    const mobileUser = document.getElementById('mobileUserActions');
    const mobileAuth = document.getElementById('mobileAuthButtons');

    // Проверяем, является ли устройство мобильным
    const isDesktop = window.innerWidth >= 1024;

    if (info) info.style.display = 'none';
    if (infoMobile) infoMobile.style.display = 'none';

    if (state.currentUser) {
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      // На мобильных устройствах кнопка выхода не должна отображаться в хедере
      logoutBtns.forEach((btn) => {
        if (btn) {
          // Проверяем, находится ли кнопка в header-actions (не в mobile меню)
          const isInHeaderActions = btn.closest('.header-actions') && !btn.closest('.mobile-menu');
          if (isInHeaderActions && !isDesktop) {
            btn.style.display = 'none'; // Скрываем на мобильных в хедере
          } else if (isInHeaderActions && isDesktop) {
            btn.style.display = 'inline-flex'; // Показываем на десктопе в хедере
          } else if (!isInHeaderActions) {
            btn.style.display = 'inline-flex'; // Показываем в мобильном меню
          }
        }
      });
      // На мобильных устройствах userActions не должен отображаться в хедере
      if (userActions) userActions.style.display = isDesktop ? 'flex' : 'none';
      if (authButtons) authButtons.style.display = 'none';
      if (mobileUser) mobileUser.style.display = 'flex';
      if (mobileAuth) mobileAuth.style.display = 'none';
    } else {
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      logoutBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      if (userActions) userActions.style.display = 'none';
      if (authButtons) authButtons.style.display = isDesktop ? 'flex' : 'none';
      if (mobileUser) mobileUser.style.display = 'none';
      if (mobileAuth) mobileAuth.style.display = 'flex';
    }
  }

  async function fetchCurrentUser() {
    // Проверяем, есть ли токен доступа - если нет, пропускаем запрос
    const token = getAccessToken();
    if (!token) {
      setState({ currentUser: null }, 'fetchCurrentUser:noToken');
      updateAuthPanel();
      updatePlayerLabelsAndTitle();
      if (state.game) {
        updateLegalMoves();
        renderBoard();
      }
      return;
    }
    
    try {
      const res = await authedFetch('/api/auth/me');
      const currentUser = res && res.ok ? await res.json() : null;
      setState({ currentUser }, 'fetchCurrentUser:success');
    } catch {
      // Игнорируем ошибки для анонимных пользователей
      setState({ currentUser: null }, 'fetchCurrentUser:error');
    }
    updateAuthPanel();
    updatePlayerLabelsAndTitle();
    if (state.game) {
      updateLegalMoves();
      renderBoard();
    }
  }

  const parseMatchId = () => {
    const pathMatch = window.location.pathname.match(/\/match\/([0-9a-fA-F-]+)/);
    if (pathMatch && pathMatch[1]) return pathMatch[1];
    const param = new URLSearchParams(window.location.search).get('game');
    return param || null;
  };

  const parseFenBoard = (fen) => {
    const boardPart = (fen || DEFAULT_FEN).split(' ')[0];
    const rows = boardPart.split('/');
    return rows.map((row) => {
      const squares = [];
      for (const char of row) {
        if (char >= '1' && char <= '8') {
          squares.push(...Array(parseInt(char, 10)).fill(''));
        } else {
          squares.push(char);
        }
      }
      return squares;
    });
  };

  const getMoveCount = () => state.moves?.length || 0;

  const isAnalysisMode = () => typeof state.analysisCursor === 'number';

  const getDisplayedMoveIndex = () => {
    const moveCount = getMoveCount();
    if (moveCount === 0) return 0;
    if (!isAnalysisMode()) return moveCount;
    return Math.max(1, Math.min(state.analysisCursor, moveCount));
  };

  const normalizeFen = (fen) => {
    if (!fen || fen === 'startpos') return DEFAULT_FEN;
    return fen;
  };

  const getLiveFen = () =>
    normalizeFen(state.game?.current_pos || state.game?.initial_pos || DEFAULT_FEN);

  const getFenForIndex = (index) => {
    if (!state.game) return DEFAULT_FEN;
    if (!isAnalysisMode()) {
      return getLiveFen();
    }
    if (index <= 0) {
      return normalizeFen(state.game.initial_pos);
    }
    const move = state.moves?.[index - 1];
    if (move?.fen_after) return normalizeFen(move.fen_after);
    return getLiveFen();
  };

  const getBoardMatrix = () => parseFenBoard(getFenForIndex(getDisplayedMoveIndex()));

  const getOrientedMatrix = () => {
    const matrix = getBoardMatrix();
    if (boardOrientation === 'white') return matrix;
    return matrix.slice().reverse().map((row) => row.slice().reverse());
  };

  const getHighlightSquares = () => {
    const viewIndex = getDisplayedMoveIndex();
    if (!viewIndex) return [];
    const targetMove = state.moves?.[viewIndex - 1];
    if (!targetMove || !targetMove.uci || targetMove.uci.length < 4) return [];
    const from = targetMove.uci.slice(0, 2);
    const to = targetMove.uci.slice(2, 4);
    return [from, to];
  };

  function renderBoard() {
    const boardEl = document.getElementById('matchBoard');
    if (!boardEl) return;

    if (!state.game) {
      boardEl.innerHTML = '<div class="board-empty">Партия не найдена</div>';
      return;
    }

    const matrix = getOrientedMatrix();
    const displayedFen = getFenForIndex(getDisplayedMoveIndex());
    const highlightSet = new Set(getHighlightSquares());
    const files = boardOrientation === 'white' ? FILES : [...FILES].reverse();
    const ranks = boardOrientation === 'white' ? RANKS : [...RANKS].reverse();
    const utils = window.ChessMoveUtils;
    const baseBoard = utils ? utils.parseFen(displayedFen).board : null;
    const analysisLocked = isAnalysisMode();
    const selectedSquare = analysisLocked ? null : state.selectedSquare;
    const targetSquares =
      !analysisLocked && state.availableTargets instanceof Set ? state.availableTargets : new Set();

    boardEl.innerHTML = '';
    const role = getCurrentUserRole();
    const expectedTurnRole = state.game?.next_turn === 'w' ? 'white' : 'black';
    const isPlayersTurn = !analysisLocked && role && role === expectedTurnRole;

    matrix.forEach((row, rIdx) => {
      row.forEach((piece, cIdx) => {
        const square = document.createElement('div');
        const isLight = (rIdx + cIdx) % 2 === 0;
        square.className = `square ${isLight ? 'light' : 'dark'}`;
        const squareName = `${files[cIdx]}${ranks[rIdx]}`;
        if (highlightSet.has(squareName)) {
          square.classList.add('highlighted');
          const overlay = document.createElement('div');
          overlay.className = 'highlight-overlay';
          square.appendChild(overlay);
        }
        if (selectedSquare && squareName === selectedSquare) {
          square.classList.add('selected-user');
        }
        let isCaptureTarget = false;
        if (targetSquares.has(squareName)) {
          square.classList.add('legal-target');
          if (baseBoard) {
            const fileIdx = squareName.charCodeAt(0) - 97;
            const rankIdx = 8 - Number.parseInt(squareName[1], 10);
            const occupant = baseBoard?.[rankIdx]?.[fileIdx];
            if (occupant && occupant !== '') {
              isCaptureTarget = true;
            }
          }
          if (isCaptureTarget) {
            square.classList.add('legal-target-capture');
          }
          const marker = document.createElement('div');
          marker.className = 'legal-move-indicator';
          if (isCaptureTarget) marker.classList.add('capture');
          square.appendChild(marker);
        }
        if (piece) {
          const pieceEl = document.createElement('span');
          pieceEl.className = 'piece';
          if (window.getPieceSVG) {
            pieceEl.innerHTML = window.getPieceSVG(piece);
          } else {
            pieceEl.textContent = PIECES[piece] || '';
          }

          const pieceBelongsToPlayer = role && pieceBelongsToRole(piece, role);
          if (isPlayersTurn && pieceBelongsToPlayer) {
            pieceEl.classList.add('piece-own');
            const movesForPiece = state.legalMovesByFrom.get(squareName);
            if (movesForPiece && movesForPiece.length > 0) {
              pieceEl.classList.add('piece-movable');
            }
          }

          square.appendChild(pieceEl);
        }
        if (rIdx === matrix.length - 1) {
          const fileCoord = document.createElement('span');
          fileCoord.className = 'coordinate file-coord';
          fileCoord.textContent = files[cIdx];
          square.appendChild(fileCoord);
        }
        if (cIdx === 0) {
          const rankCoord = document.createElement('span');
          rankCoord.className = 'coordinate rank-coord';
          rankCoord.textContent = ranks[rIdx];
          square.appendChild(rankCoord);
        }
        square.dataset.square = squareName;
        square.addEventListener('click', () => handleSquareClick(squareName));

        if (isPlayersTurn && piece && role && pieceBelongsToRole(piece, role)) {
          const movesForPiece = state.legalMovesByFrom.get(squareName);
          if (movesForPiece && movesForPiece.length > 0) {
            square.classList.add('square-hoverable');
            square.title = 'Кликните, чтобы выбрать фигуру и увидеть возможные ходы';
          }
        }

        boardEl.appendChild(square);
      });
    });
  }

  function computeOrientationFromRole() {
    if (userSetOrientation) return;
    const role = getCurrentUserRole();
    if (role === 'white' || role === 'black') {
      boardOrientation = role;
    } else {
      boardOrientation = 'white';
    }
  }

  function setMessageVisible(show, text) {
    const message = document.getElementById('matchMessage');
    if (!message) return;
    if (show) {
      message.style.display = 'block';
      if (text) message.textContent = text;
    } else {
      message.style.display = 'none';
    }
  }

  const MatchClocksModule = window.MatchClocks;
  if (!MatchClocksModule) {
    throw new Error('MatchClocks module is not loaded. Ensure match.clocks.js is included before match.js');
  }
  const {
    getDisplayedClocks: clocksGetDisplayedClocks,
    updateClockDisplays: clocksUpdateClockDisplays,
  } = MatchClocksModule;

  function getDisplayedClocks(applyRunning = true) {
    return clocksGetDisplayedClocks(applyRunning);
  }

  function updateClockDisplays(resetTimer = false) {
    clocksUpdateClockDisplays(resetTimer, getPanelRoles, (clocks) => {
      maybeAutoDeclareTimeout(clocks);
      renderActions();
    });
  }

  function maybeAutoDeclareTimeout(clocks) {
    if (!state.game || state.game.status !== 'ACTIVE') {
      if (state.timeoutAutoRequested) {
        setState({ timeoutAutoRequested: false }, 'autoTimeout:inactive');
      }
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      if (state.timeoutAutoRequested) {
        setState({ timeoutAutoRequested: false }, 'autoTimeout:noRole');
      }
      return;
    }
    
    const white_finish = state.game.white_finish_ms || state.game.time_control?.white_finish_ms || state.game.time_control?.initial_ms || 0;
    const black_finish = state.game.black_finish_ms || state.game.time_control?.black_finish_ms || state.game.time_control?.initial_ms || 0;
    if (white_finish === 0 || black_finish === 0) {
      if (state.timeoutAutoRequested) {
        setState({ timeoutAutoRequested: false }, 'autoTimeout:noTimeControl');
      }
      return;
    }
    
    const opponentPast = role === 'white' ? state.game.black_clock_ms : state.game.white_clock_ms;
    const opponentFinish = role === 'white' ? black_finish : white_finish;
    if (opponentPast < opponentFinish) {
      if (state.timeoutAutoRequested) {
        setState({ timeoutAutoRequested: false }, 'autoTimeout:clockNotExpired');
      }
      return;
    }
    
    if (state.timeoutAutoRequested) return;
    setState({ timeoutAutoRequested: true }, 'autoTimeout:trigger');
    submitTimeoutClaim({ autoTriggered: true });
  }

  function renderMoves() {
    const list = document.getElementById('movesList');
    if (!list) return;
    if (!state.moves.length) {
      list.innerHTML = '<li style="justify-content:center;color:rgba(148,163,184,.7);">Ходов пока нет</li>';
      return;
    }
    const activeIndex = getDisplayedMoveIndex();
    const preserveScroll = isAnalysisMode() ? list.scrollTop : null;
    const rows = [];
    for (let i = 0; i < state.moves.length; i += 2) {
      const moveNumber = Math.floor(i / 2) + 1;
      const whiteMove = state.moves[i];
      const blackMove = state.moves[i + 1];
      rows.push(`
        <li class="move-row">
          <span class="move-label">${moveNumber}.</span>
          ${renderMoveCell(whiteMove, activeIndex)}
          ${renderMoveCell(blackMove, activeIndex)}
        </li>
      `);
    }
    list.innerHTML = rows.join('');
    list.querySelectorAll('.move-cell[data-move-index]').forEach((cell) => {
      cell.addEventListener('click', () => {
        const idx = Number(cell.dataset.moveIndex);
        if (Number.isNaN(idx)) return;
        focusOnMove(idx);
      });
    });
    if (preserveScroll !== null) {
      list.scrollTop = preserveScroll;
    } else {
      list.scrollTop = list.scrollHeight;
    }
  }

  function renderMoveCell(move, activeIndex) {
    if (!move) {
      return '<span class="move-cell empty">—</span>';
    }
    const label = move.san || move.uci || '…';
    const isActive = move.move_index === activeIndex;
    return `<button type="button" class="move-cell${isActive ? ' active' : ''}" data-move-index="${move.move_index}">
      ${label}
    </button>`;
  }

  function focusOnMove(moveIndex) {
    const moveCount = getMoveCount();
    if (moveCount === 0) return;
    const normalized = Math.max(1, Math.min(moveIndex, moveCount));
    const nextCursor = normalized === moveCount ? null : normalized;
    if (state.analysisCursor !== nextCursor) {
      setState({ analysisCursor: nextCursor }, 'focusOnMove');
      resetSelection();
    }
    renderBoard();
    renderMoves();
  }

  function resetSelection() {
    setState(
      {
        selectedSquare: null,
        availableTargets: new Set(),
      },
      'resetSelection'
    );
  }

  function pieceBelongsToRole(piece, role) {
    if (!piece) return false;
    const isWhite = piece === piece.toUpperCase();
    return role === (isWhite ? 'white' : 'black');
  }

  function getPieceAtSquare(fen, square) {
    const utils = window.ChessMoveUtils;
    if (!utils || !fen || !square) return null;
    const { board } = utils.parseFen(fen);
    const fileIdx = square.charCodeAt(0) - 97;
    const rankIdx = 8 - Number.parseInt(square[1], 10);
    if (Number.isNaN(fileIdx) || Number.isNaN(rankIdx)) return null;
    return board?.[rankIdx]?.[fileIdx] ?? null;
  }

  function updateLegalMoves() {
    setState({ legalMovesByFrom: new Map() }, 'updateLegalMoves:reset');
    resetSelection();

    if (!state.game) {
      return;
    }

    const bothPlayersJoined = haveBothPlayersJoined();

    if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) {
      return;
    }

    const utils = window.ChessMoveUtils;
    if (!utils) {
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      return;
    }
    const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
    if (role !== expectedTurn) {
      return;
    }

    const { movesByFrom } = utils.generateMoves(state.game.current_pos, role);

    movesByFrom.forEach((uciSet, fromSquare) => {
      const entries = [];
      uciSet.forEach((uci) => {
        const base = uci.slice(0, 4);
        const to = uci.slice(2, 4);
        const promotion = uci.length > 4 ? uci.slice(4) : null;
        entries.push({ from: fromSquare, to, base, promotion });
      });
      if (entries.length) {
        state.legalMovesByFrom.set(fromSquare, entries);
      }
    });
  }

  function executeMove(fromSquare, toSquare) {
    const moves = state.legalMovesByFrom.get(fromSquare);
    if (!moves || !moves.length) return;
    const options = moves.filter((entry) => entry.to === toSquare);
    if (!options.length) return;
    let chosen = options[0];
    if (options.length > 1) {
      let promotion = prompt('Выберите фигуру для промоции (q, r, b, n)', 'q');
      if (!promotion) return;
      promotion = promotion.toLowerCase();
      chosen = options.find((entry) => entry.promotion === promotion);
      if (!chosen) {
        showToast('Неверная фигура промоции', 'error');
        return;
      }
    }
    const success = attemptMove(chosen.base, chosen.promotion);
    if (success) {
      resetSelection();
      renderBoard();
    }
  }

  function handleSquareClick(squareName) {
    if (!state.game) {
      return;
    }
    if (isAnalysisMode()) {
      showToast('Вы просматриваете предыдущий ход. Выберите последний ход, чтобы продолжить партию.', 'info');
      return;
    }
    const bothPlayersJoined = haveBothPlayersJoined();

    if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) {
      if (state.game.status === 'CREATED') {
        showToast('Дождитесь присоединения соперника, чтобы начать игру', 'info');
      }
      return;
    }
    if (state.pendingMove) {
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      return;
    }
    const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
    if (role !== expectedTurn) {
      return;
    }
    const square = squareName.toLowerCase();

    if (state.selectedSquare && state.availableTargets.has(square)) {
      executeMove(state.selectedSquare, square);
      return;
    }

    if (state.selectedSquare === square) {
      resetSelection();
      renderBoard();
      return;
    }

    const moves = state.legalMovesByFrom.get(square);

    if (!moves || !moves.length) {
      resetSelection();
      renderBoard();
      return;
    }

    const piece = getPieceAtSquare(state.game.current_pos, square);

    if (!piece || !pieceBelongsToRole(piece, role)) {
      resetSelection();
      renderBoard();
      return;
    }
    setState(
      {
        selectedSquare: square,
        availableTargets: new Set(moves.map((entry) => entry.to)),
      },
      'handleSquareClick:select'
    );
    renderBoard();
  }

  const canJoinGame = () => {
    if (!state.game) return false;
    if (state.game.status !== 'CREATED') return false;
    
    // Проверяем, авторизован ли пользователь или есть session_id
    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
    const hasSession = typeof window.getSessionId === 'function' && window.getSessionId() !== null;
    
    // Проверяем, является ли партия рейтинговой
    const isRated = state.game.metadata?.rated === true;
    
    // Анонимные пользователи не могут присоединяться к рейтинговым партиям
    if (!isAuth && isRated) return false;
    
    if (!isAuth && !hasSession) return false;
    
    // Проверяем, не участвует ли уже игрок
    if (isAuth && state.currentUser) {
      if (state.currentUser.id === state.game.white_id || state.currentUser.id === state.game.black_id) return false;
    } else if (hasSession) {
      // Для анонимных игроков проверяем session_id в metadata
      const metadata = state.game.metadata || {};
      const sessionId = window.getSessionId();
      if (sessionId === metadata.white_session_id || sessionId === metadata.black_session_id) return false;
    }
    
    return getAvailableSeat(state.game) !== null;
  };

  const shouldAutoJoin = () => {
    if (!state.game || state.autoJoinAttempted) return false;
    if (state.game.status !== 'CREATED') return false;
    
    // Проверяем, авторизован ли пользователь или есть session_id
    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
    const hasSession = typeof window.getSessionId === 'function' && window.getSessionId() !== null;
    
    if (!isAuth && !hasSession) return false;
    
    // Проверяем, не участвует ли уже игрок
    if (isAuth && state.currentUser) {
      if (state.currentUser.id === state.game.white_id || state.currentUser.id === state.game.black_id) return false;
    } else if (hasSession) {
      // Для анонимных игроков проверяем session_id в metadata
      const metadata = state.game.metadata || {};
      const sessionId = window.getSessionId();
      if (sessionId === metadata.white_session_id || sessionId === metadata.black_session_id) return false;
    }
    
    return getAvailableSeat(state.game) !== null;
  };

  const canDeclareTimeout = (role) => {
    if (!state.game) return false;
    const white_finish = state.game.white_finish_ms || state.game.time_control?.white_finish_ms || state.game.time_control?.initial_ms || 0;
    const black_finish = state.game.black_finish_ms || state.game.time_control?.black_finish_ms || state.game.time_control?.initial_ms || 0;
    if (white_finish === 0 || black_finish === 0) return false;
    if (role === 'white') {
      return state.game.black_clock_ms >= black_finish;
    }
    if (role === 'black') {
      return state.game.white_clock_ms >= white_finish;
    }
    return false;
  };

  function renderActions() {
    const container = document.getElementById('gameActions');
    if (!container) return;
    container.innerHTML = '';
    if (!state.game) return;

    const seat = getAvailableSeat(state.game);
    const joinBtn = document.createElement('button');
    joinBtn.className = 'btn btn-primary';
    joinBtn.textContent =
      seat === 'white'
        ? 'Присоединиться белыми'
        : seat === 'black'
          ? 'Присоединиться чёрными'
          : 'Присоединиться';
    joinBtn.addEventListener('click', () => joinGame());

    const resignBtn = document.createElement('button');
    resignBtn.className = 'btn btn-danger';
    resignBtn.textContent = 'Сдаться';
    resignBtn.addEventListener('click', resignGame);

    const flagBtn = document.createElement('button');
    flagBtn.className = 'btn btn-outline';
    flagBtn.textContent = 'Заявить флаг соперника';
    flagBtn.addEventListener('click', declareTimeout);

    const copyBtn = document.createElement('button');
    copyBtn.className = 'btn btn-outline';
    copyBtn.textContent = 'Скопировать ссылку';
    copyBtn.addEventListener('click', copyShareLink);

    const refreshBtn = document.createElement('button');
    refreshBtn.className = 'btn btn-outline';
    refreshBtn.textContent = 'Обновить';
    refreshBtn.addEventListener('click', loadMatch);

    if (canJoinGame()) container.appendChild(joinBtn);

    const role = getCurrentUserRole();
    if (role && state.game.status === 'ACTIVE') {
      container.appendChild(resignBtn);
      if (canDeclareTimeout(role)) container.appendChild(flagBtn);
    }

    container.appendChild(copyBtn);
    container.appendChild(refreshBtn);
  }

  function maybeAutoJoin() {
    // Проверяем авторизацию или наличие session_id
    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
    const hasSession = typeof window.getSessionId === 'function' && window.getSessionId() !== null;
    
    if (!isAuth && !hasSession && !state.loginPromptShown) {
      const token = getAccessToken();
      if (token) {
        setTimeout(() => {
          if (shouldAutoJoin()) {
            setState({ autoJoinAttempted: true }, 'maybeAutoJoin:autoAttempt');
            joinGame(true);
          } else if (!isAuth && !hasSession && !state.loginPromptShown) {
            setState({ loginPromptShown: true }, 'maybeAutoJoin:prompt');
            showToast('Войдите, чтобы занять место соперника', 'error');
          }
        }, 200);
        return;
      }
    }

    if (shouldAutoJoin()) {
      setState({ autoJoinAttempted: true }, 'maybeAutoJoin:autoAttempt');
      joinGame(true);
      return;
    }
    
    // Проверяем, можно ли присоединиться (для анонимных тоже)
    if (
      !state.game ||
      state.game.status !== 'CREATED' ||
      !getAvailableSeat(state.game) ||
      state.loginPromptShown
    ) {
      return;
    }
    
    // Если нет авторизации и нет session_id, показываем сообщение
    if (!isAuth && !hasSession) {
      setState({ loginPromptShown: true }, 'maybeAutoJoin:prompt');
      showToast('У вас нет токена сессии', 'error');
    }
  }

  function copyGameId() {
    const field = document.getElementById('gameIdField');
    if (!field || !field.value) return;
    navigator.clipboard.writeText(field.value)
      .then(() => showToast('UUID партии скопирован', 'success'))
      .catch(() => showToast('Не удалось скопировать UUID', 'error'));
  }

  function copyShareLink() {
    if (!state.matchId) return;
    const url = `${window.location.origin}/match/${state.matchId}`;
    navigator.clipboard.writeText(url)
      .then(() => showToast('Ссылка на партию скопирована', 'success'))
      .catch(() => showToast('Не удалось скопировать ссылку', 'error'));
  }

  function toggleBoardOrientation() {
    boardOrientation = boardOrientation === 'white' ? 'black' : 'white';
    userSetOrientation = true;
    renderBoard();
    updatePlayerLabelsAndTitle();
    updateClockDisplays(false);
  }

  function updateWsIndicator(status) {
    const indicator = document.getElementById('wsStatus');
    if (!indicator) return;
    indicator.textContent = `WS: ${status}`;
    indicator.className = `ws-indicator ${status === 'online' ? 'ws-online' : 'ws-offline'}`;
  }

  function applyGameDetail(detail, { isRealtimeMove = false, moveTimestamp = null } = {}) {
    const previousGame = state.game;
    const previousRole = getCurrentUserRole();
    
    setState(
      {
        game: detail,
        moves: detail?.moves || [],
      },
      'applyGameDetail:updateGame'
    );
    const moveCount = detail?.moves?.length || 0;
    
    if (typeof state.analysisCursor === 'number' && state.analysisCursor > moveCount) {
      setState({ analysisCursor: null }, 'applyGameDetail:clampAnalysis');
    }

    const now = Date.now();
    const isFirstMove = detail.move_count === 1;
    let clockAnchorTime;
    
    if (isFirstMove) {
      clockAnchorTime = now;
    } else if (isRealtimeMove && moveTimestamp !== null) {
      clockAnchorTime = moveTimestamp;
    } else if (detail.moves && detail.moves.length > 0) {
      const lastMove = detail.moves[detail.moves.length - 1];
      clockAnchorTime = lastMove.created_at ? new Date(lastMove.created_at).getTime() : now;
    } else {
      clockAnchorTime = state.clockAnchorTime || now;
    }
    
    setState({ clockAnchorTime }, 'applyGameDetail:timestamp');

    setState({ pendingMove: false }, 'applyGameDetail:pending');
    if (state.timeoutAutoRequested && detail.status !== 'ACTIVE') {
      setState({ timeoutAutoRequested: false }, 'applyGameDetail:clearAutoTimeout');
    }

    const newRole = getCurrentUserRole();
    if (newRole !== previousRole) {
      userSetOrientation = false;
    }

    updateLegalMoves();
    computeOrientationFromRole();
    updateUI();
    maybeAutoJoin();
    ensurePlayerUsernames(detail).then(() => {
      updatePlayerLabelsAndTitle();
      updateWinnerDisplay();
    });

    const notifyOpponentJoined = () => {
      if (!state.game) return;
      const role = getCurrentUserRole();
      if (role === 'white') {
        const currentOpponent = state.game.black_id;
        const previousOpponent = previousGame?.black_id ?? null;
        if (
          currentOpponent !== null &&
          currentOpponent !== undefined &&
          currentOpponent !== previousOpponent
        ) {
          fetchUsername(currentOpponent).then((resolved) => {
            const display = resolved || `ID ${currentOpponent}`;
            showToast(`Соперник ${display} подключился к партии`, 'info');
          });
        }
      } else if (role === 'black') {
        const currentOpponent = state.game.white_id;
        const previousOpponent = previousGame?.white_id ?? null;
        if (
          currentOpponent !== null &&
          currentOpponent !== undefined &&
          currentOpponent !== previousOpponent
        ) {
          fetchUsername(currentOpponent).then((resolved) => {
            const display = resolved || `ID ${currentOpponent}`;
            showToast(`Соперник ${display} подключился к партии`, 'info');
          });
        }
      }
    };

    notifyOpponentJoined();
  }

  function updateUI() {
    updatePlayerLabelsAndTitle();

    const badge = document.getElementById('gameStatusBadge');
    if (badge) {
      if (state.game) {
        badge.textContent = translateStatus(state.game.status, state.game.next_turn);
        badge.className = `pill ${statusClass(state.game.status)}`;
      } else {
        badge.textContent = '—';
        badge.className = 'pill';
      }
    }

    const timeControlEl = document.getElementById('gameTimeControl');
    if (timeControlEl) {
      timeControlEl.textContent = state.game ? describeTimeControl(state.game.time_control) : '—';
    }

    const resultEl = document.getElementById('gameResult');
    if (resultEl) {
      resultEl.textContent = state.game?.result || '—';
    }

    updateWinnerDisplay();

    const gameIdField = document.getElementById('gameIdField');
    if (gameIdField) {
      gameIdField.value = state.game?.id || '';
    }
    
    // Обновление количества зрителей (будет обновляться через WebSocket)
    // Инициализируем скрытым, если функция еще не определена
    if (typeof window.updateViewersCount === 'function') {
      // Функция уже определена, ничего не делаем
    } else {
      // Определяем функцию для обновления количества зрителей
      window.updateViewersCount = function(count) {
        const viewersRow = document.getElementById('viewersRow');
        const viewersCountEl = document.getElementById('viewersCount');
        if (!viewersRow || !viewersCountEl) return;
        
        if (count > 0) {
          viewersCountEl.textContent = count;
          viewersRow.style.display = '';
        } else {
          viewersRow.style.display = 'none';
        }
      };
    }

    if (!state.game) {
      setMessageVisible(true, 'Партия не найдена или недоступна. Проверьте ссылку или вернитесь к списку матчей.');
    } else {
      setMessageVisible(false);
    }

    renderBoard();
    renderMoves();
    renderActions();
    updateClockDisplays(true);
  }

  async function loadMatch() {
    if (!state.matchId) {
      setState({ game: null }, 'loadMatch:noMatch');
      updateUI();
      return;
    }
    try {
      const res = await fetch(buildUrl(`/api/games/${state.matchId}?moves_limit=200`));
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      
      // Проверяем, является ли партия рейтинговой и аноним ли пользователь
      const isRated = detail.metadata?.rated === true;
      const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
      
      if (isRated && !isAuth) {
        // Анонимный пользователь пытается зайти на рейтинговую партию - перенаправляем на логин
        showToast('Для участия в рейтинговой партии необходимо войти в аккаунт', 'error');
        setTimeout(() => {
          window.location.href = '/login';
        }, 1500);
        return;
      }
      
      applyGameDetail(detail);
      connectWebSocket(state.matchId);
      
      // Запускаем polling, если игра в статусе CREATED и оба игрока еще не присоединились
      if (detail.status === 'CREATED' && !haveBothPlayersJoined(detail)) {
        startGamePolling();
      }
    } catch (err) {
      console.error(err);
      showToast('Не удалось загрузить партию', 'error');
      setState({ game: null, moves: [] }, 'loadMatch:error');
      updateUI();
    }
  }

  function stopGamePolling() {
    if (state.gamePollingInterval) {
      clearInterval(state.gamePollingInterval);
      setState({ gamePollingInterval: null }, 'stopGamePolling');
    }
  }

  async function pollGameState() {
    if (!state.matchId) return;
    
    try {
      const res = await fetch(buildUrl(`/api/games/${state.matchId}?moves_limit=200`));
      if (!res.ok) {
        if (res.status === 404) {
          stopGamePolling();
          showToast('Партия не найдена', 'error');
        }
        return;
      }
      
      const detail = await res.json();
      const previousGame = state.game;
      const previousBothJoined = haveBothPlayersJoined(previousGame);
      const previousStatus = previousGame?.status;
      const currentBothJoined = haveBothPlayersJoined(detail);
      
      // Применяем обновления
      applyGameDetail(detail);
      
      // Если оба игрока присоединились впервые
      if (!previousBothJoined && currentBothJoined) {
        updateLegalMoves();
        renderBoard();
        showToast('Соперник присоединился! Теперь можно начинать игру', 'success');
        // Начинаем отсчет времени, если игра активна
        if (detail.status === 'ACTIVE') {
          updateClockDisplays(true);
        }
      }
      
      // Если игра стала активной
      if (previousStatus === 'CREATED' && detail.status === 'ACTIVE') {
        showToast('Игра началась! Теперь вы можете делать ходы', 'success');
        updateClockDisplays(true);
      }
      
      // Останавливаем polling, если оба игрока присоединились или игра завершена/отменена
      if (currentBothJoined || detail.status === 'FINISHED' || detail.status === 'CANCELLED' || detail.status === 'ABANDONED') {
        stopGamePolling();
      }
    } catch (err) {
      console.error('[pollGameState] Error:', err);
    }
  }

  function startGamePolling() {
    stopGamePolling();
    // Poll каждые 2 секунды, если игра еще в статусе CREATED и оба игрока не присоединились
    const interval = setInterval(() => {
      if (!state.game || state.game.status !== 'CREATED' || haveBothPlayersJoined()) {
        stopGamePolling();
        return;
      }
      pollGameState();
    }, 2000);
    setState({ gamePollingInterval: interval }, 'startGamePolling');
  }

  function wsLog(level, message, data = null) {
    if (level === 'error') {
      console.error(`[WS] ${message}`, data || '');
    }
  }

  function connectWebSocket(gameId, options = {}) {
    // Поддержка анонимных игр через session_id
    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
    if (!gameId) return;
    const { isReconnect = false } = options;
    if (!isReconnect) {
      setState({ wsRetryCount: 0 }, 'connectWebSocket:initial');
    }
    clearWsReconnectTimer();
    if (state.ws) {
      state.ws.onopen = null;
      state.ws.onclose = null;
      state.ws.onmessage = null;
      state.ws.close();
      setState({ ws: null }, 'connectWebSocket:cleanup');
    }
    updateWsIndicator('offline');
    const token = getAccessToken();
    const protocol = window.location.protocol === 'https:' ? 'wss' : 'ws';
    
    // Формируем URL с токеном или session_id
    let url = `${protocol}://${window.location.host}/ws/games/${gameId}`;
    const params = new URLSearchParams();
    
    if (token) {
      params.append('token', token);
    } else if (typeof window.getSessionId === 'function') {
      const sessionId = window.getSessionId();
      if (sessionId) {
        params.append('session_id', sessionId);
      }
    }
    
    if (params.toString()) {
      url += '?' + params.toString();
    }
    try {
      const ws = new WebSocket(url);
      setState({ ws }, 'connectWebSocket:init');
      ws.onopen = () => {
        updateWsIndicator('online');
        resetWsRetryState();
      };
      ws.onclose = (event) => {
        handleWsClose(event);
      };
      ws.onerror = (error) => {
        wsLog('error', 'WebSocket error', { error, gameId });
        updateWsIndicator('offline');
      };
      ws.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          handleWsPayload(payload);
        } catch (err) {
          wsLog('error', 'WebSocket parse error', { error: err, rawData: event.data });
        }
      };
    } catch (err) {
      wsLog('error', 'WebSocket connection error', { error: err, gameId, url });
      updateWsIndicator('offline');
    }
  }

  function handleWsPayload(payload) {
    if (!payload) return;

    if (payload.type === 'game_cancelled') {
      setState({ pendingMove: false }, 'handleWsPayload:cancelled');
      showToast('Партия отменена: никто не сделал ход', 'error');
      setTimeout(() => {
        window.location.href = '/games';
      }, 1200);
      return;
    }
    if (payload.type === 'viewers_count') {
      if (typeof window.updateViewersCount === 'function') {
        window.updateViewersCount(payload.viewers_count || 0);
      }
      return;
    }
    if (payload.type === 'move_rejected' || payload.type === 'error') {
      setState({ pendingMove: false }, 'handleWsPayload:rejected');
      requestAnimationFrame(() => {
        updateLegalMoves();
        renderBoard();
      });
      showToast(payload.message || 'Ход отклонён', 'error');
      return;
    }
    if (payload.type === 'state' || payload.type === 'game_finished' || payload.type === 'move_made') {
      const previousStatus = state.game?.status;
      const previousGame = state.game;
      const previousBothJoined = haveBothPlayersJoined(previousGame);
      const isRealtimeMove = payload.type === 'move_made';
      const moveTimestamp = isRealtimeMove && payload.move?.created_at 
        ? new Date(payload.move.created_at).getTime() 
        : null;
      
      applyGameDetail(payload.game, { isRealtimeMove, moveTimestamp });
      ensurePlayerUsernames(payload.game).then(() => {
        updatePlayerLabelsAndTitle();
        updateWinnerDisplay();
      });
      
      const currentBothJoined = haveBothPlayersJoined(payload.game);
      const wasWaiting = !previousBothJoined;
      
      // Если оба игрока присоединились впервые
      if (wasWaiting && currentBothJoined) {
        stopGamePolling(); // Останавливаем polling, так как оба игрока присоединились
        updateLegalMoves();
        renderBoard();
        showToast('Соперник присоединился! Теперь можно начинать игру', 'success');
        // Начинаем отсчет времени, если игра активна
        if (payload.game.status === 'ACTIVE') {
          updateClockDisplays(true);
        }
      }
      
      if (previousStatus === 'CREATED' && payload.game.status === 'ACTIVE') {
        stopGamePolling(); // Останавливаем polling, так как игра началась
        showToast('Игра началась! Теперь вы можете делать ходы', 'success');
        updateClockDisplays(true);
      }
      
      if (payload.type === 'move_made') {
        requestAnimationFrame(() => {
          updateLegalMoves();
          renderBoard();
          renderMoves();
          updateClockDisplays();
        });
      }
    }
  }

  async function joinGame(autoTriggered = false) {
    if (!state.matchId) return;
    
    // Проверяем авторизацию или используем анонимную сессию
    const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (getAccessToken() !== null && getAccessToken() !== '');
    
    // Проверяем, является ли партия рейтинговой
    const isRated = state.game?.metadata?.rated === true;
    
    // Анонимные пользователи не могут присоединяться к рейтинговым партиям
    if (!isAuth && isRated) {
      const errorMessage = 'Для участия в рейтинговой партии необходимо войти в аккаунт';
      if (autoTriggered) {
        if (!state.loginPromptShown) {
          setState({ loginPromptShown: true }, 'joinGame:ratedGamePrompt');
          showToast(errorMessage, 'error');
        }
      } else {
        showToast(errorMessage, 'error');
      }
      // Перенаправляем на страницу входа
      setTimeout(() => {
        window.location.href = '/login';
      }, 1500);
      return;
    }
    
    // Для анонимных пользователей проверяем наличие session_id функции
    if (!isAuth) {
      if (typeof window.getOrCreateSessionId !== 'function' || typeof window.getAnonymousHeaders !== 'function') {
        if (autoTriggered) {
          if (!state.loginPromptShown) {
            setState({ loginPromptShown: true }, 'joinGame:autoTriggerLoginPrompt');
            showToast('Войдите, чтобы занять место соперника', 'error');
          }
        } else {
          showToast('Войдите в аккаунт, чтобы присоединиться', 'error');
        }
        return;
      }
      // Создаем session_id заранее для анонимных пользователей
      window.getOrCreateSessionId();
    }
    
    setState({ autoJoinAttempted: true }, 'joinGame:attempt');
    try {
      let res;
      if (isAuth) {
        res = await authedFetch(`/api/games/${state.matchId}/join`, { method: 'POST' });
      } else {
        // Анонимный запрос с session_id
        if (typeof window.getAnonymousHeaders !== 'function') {
          showToast('Ошибка: не удалось создать сессию для анонимной игры', 'error');
          return;
        }
        
        const headers = window.getAnonymousHeaders();
        console.log('[joinGame] Анонимное присоединение, session_id:', headers['X-Session-ID']);
        
        res = await fetch(`/api/games/${state.matchId}/join`, {
          method: 'POST',
          headers,
        });
      }
      
      if (!res.ok) {
        const errorText = await res.text();
        console.error('[joinGame] Ошибка присоединения:', res.status, errorText);
        let errorMessage = 'Не удалось присоединиться к партии';
        try {
          const errorData = JSON.parse(errorText);
          errorMessage = errorData.detail || errorData.message || errorMessage;
        } catch {
          errorMessage = errorText || errorMessage;
        }
        throw new Error(errorMessage);
      }
      
      const detail = await res.json();
      applyGameDetail(detail);
      connectWebSocket(state.matchId);
      showToast('Вы присоединились к партии', 'success');
    } catch (err) {
      console.error('[joinGame] Ошибка:', err);
      const errorMessage = err.message || 'Не удалось присоединиться к партии';
      showToast(errorMessage, 'error');
    }
  }

  async function resignGame() {
    if (!state.matchId) return;
    if (!state.currentUser) {
      showToast('Войдите в аккаунт, чтобы сдаться', 'error');
      return;
    }
    if (!confirm('Подтвердите сдачу партии')) return;
    try {
      const res = await authedFetch(`/api/games/${state.matchId}/resign`, { method: 'POST' });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      applyGameDetail(detail);
      showToast('Вы сдались в партии', 'success');
    } catch (err) {
      console.error(err);
      showToast('Не удалось сдаться в партии', 'error');
    }
  }

  async function submitTimeoutClaim({ autoTriggered = false } = {}) {
    if (!state.matchId) return;
    if (!state.currentUser) {
      if (!autoTriggered) {
        showToast('Войдите в аккаунт, чтобы заявить флаг', 'error');
      }
      return;
    }
    const role = getCurrentUserRole();
    if (!role) {
      if (!autoTriggered) {
        showToast('Заявлять флаг могут только участники партии', 'error');
      }
      return;
    }
    const loser = role === 'white' ? 'black' : 'white';
    try {
      const res = await authedFetch(`/api/games/${state.matchId}/timeout`, {
        method: 'POST',
        body: JSON.stringify({ loser_color: loser }),
      });
      if (!res.ok) throw new Error(await res.text());
      const detail = await res.json();
      applyGameDetail(detail);
      showToast(
        autoTriggered ? 'Время соперника истекло. Партия завершена' : 'Партия завершена по времени',
        'success'
      );
    } catch (err) {
      console.error(err);
      if (autoTriggered) {
        setState({ timeoutAutoRequested: false }, 'autoTimeout:failed');
        showToast('Не удалось автоматически завершить партию по времени', 'error');
      } else {
        showToast('Не удалось завершить партию по времени', 'error');
      }
    }
  }

  async function declareTimeout(event) {
    if (event && typeof event.preventDefault === 'function') {
      event.preventDefault();
    }
    await submitTimeoutClaim({ autoTriggered: false });
  }

  function attemptMove(baseUci, promotion) {
    if (!state.game || !state.ws || state.ws.readyState !== WebSocket.OPEN) {
      showToast('Вебсокет не подключен', 'error');
      return false;
    }
    if (state.pendingMove) {
      showToast('Дождитесь подтверждения предыдущего хода', 'error');
      return false;
    }
    const role = getCurrentUserRole();
    if (!role) {
      showToast('Ходы могут делать только участники партии', 'error');
      return false;
    }
    const bothPlayersJoined = haveBothPlayersJoined();

    if (state.game.status !== 'ACTIVE' && !bothPlayersJoined) {
      showToast('Партия не активна. Дождитесь присоединения соперника', 'error');
      return false;
    }

    if (!bothPlayersJoined) {
      showToast('Дождитесь присоединения соперника', 'error');
      return false;
    }
    const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
    if (role !== expectedTurn) {
      showToast('Сейчас очередь соперника', 'error');
      return false;
    }
    const normalizedPromotion = promotion ? promotion.toLowerCase() : null;
    if (normalizedPromotion && !['q', 'r', 'b', 'n'].includes(normalizedPromotion)) {
      showToast('Символ промоции должен быть q, r, b или n', 'error');
      return false;
    }
    const normalizedUci = baseUci.toLowerCase();
    const uciForValidation = normalizedPromotion
      ? `${normalizedUci}${normalizedPromotion}`
      : normalizedUci;
    const moveUtils = window.ChessMoveUtils;
    if (moveUtils) {
      const fen = state.game.current_pos;
      if (!moveUtils.isMoveAllowed(fen, role, uciForValidation)) {
        showToast('Недопустимый ход для ваших фигур', 'error');
        return false;
      }
    }
    const payload = {
      type: 'make_move',
      uci: normalizedUci,
      promotion: normalizedPromotion,
      client_move_id: `web-${Date.now()}`,
    };
    
    state.ws.send(JSON.stringify(payload));
    setState({ pendingMove: true }, 'attemptMove:pending');
    resetSelection();
    renderBoard();
    return true;
  }

  function handleMoveSubmit(event) {
    event.preventDefault();
    if (isAnalysisMode()) {
      showToast('Чтобы сделать ход, вернитесь к текущей позиции', 'info');
      return;
    }
    const uciInput = document.getElementById('uciInput');
    const promotionInput = document.getElementById('promotionInput');
    const rawUci = (uciInput?.value || '').trim().toLowerCase();
    let promotion = (promotionInput?.value || '').trim().toLowerCase();
    if (rawUci.length < 4) {
      showToast('Введите ход в формате UCI', 'error');
      return;
    }
    const baseUci = rawUci.slice(0, 4);
    if (!promotion && rawUci.length > 4) {
      promotion = rawUci.slice(4);
    }
    if (attemptMove(baseUci, promotion)) {
      if (uciInput) uciInput.value = '';
      if (promotionInput) promotionInput.value = '';
    }
  }

  function handleLoginRedirect() {
    window.location.href = '/login';
  }

  function handleRegisterRedirect() {
    window.location.href = '/register';
  }

  function handleLogout() {
    clearTokens();
    setState({ currentUser: null }, 'handleLogout');
    updateAuthPanel();
    showToast('Вы вышли из аккаунта');
  }

  function loadTheme() {
    if (window.loadTheme && typeof window.loadTheme === 'function') {
      window.loadTheme();
      isDarkTheme = document.body.classList.contains('dark');
    } else {
      const saved = localStorage.getItem('theme');
      isDarkTheme = saved === 'dark';
      document.body.classList.toggle('dark', isDarkTheme);
      document.documentElement.classList.toggle('dark', isDarkTheme);
      const icon = document.getElementById('themeIcon');
      if (icon) icon.className = isDarkTheme ? 'fas fa-moon' : 'fas fa-sun';
    }
  }

  function toggleTheme() {
    if (window.toggleTheme && typeof window.toggleTheme === 'function') {
      window.toggleTheme();
      isDarkTheme = document.body.classList.contains('dark');
    } else {
      isDarkTheme = !isDarkTheme;
      document.body.classList.toggle('dark', isDarkTheme);
      document.documentElement.classList.toggle('dark', isDarkTheme);
      const icon = document.getElementById('themeIcon');
      if (icon) icon.className = isDarkTheme ? 'fas fa-moon' : 'fas fa-sun';
      localStorage.setItem('theme', isDarkTheme ? 'dark' : 'light');
    }
  }

  // Mobile menu functions теперь в mobile-menu.js
  // Используем функции из window.toggleMobileMenu и window.closeMobileMenu

  function handleHeaderScroll() {
    const header = document.getElementById('header');
    if (!header) return;
    if (window.scrollY > 50) header.classList.add('scrolled');
    else header.classList.remove('scrolled');
  }

  async function init() {
    loadTheme();
    handleHeaderScroll();
    window.addEventListener('scroll', handleHeaderScroll, { passive: true });
    window.addEventListener('resize', () => {
      if (window.innerWidth >= 1024) closeMobileMenu();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeMobileMenu();
    });

    document.getElementById('flipBoardBtn')?.addEventListener('click', () => {
      toggleBoardOrientation();
    });
    document.getElementById('copyMatchLinkBtn')?.addEventListener('click', copyShareLink);
    document.getElementById('copyGameIdBtn')?.addEventListener('click', copyGameId);
    document.getElementById('backToGamesBtn')?.addEventListener('click', () => {
      window.location.href = '/games';
    });
    document.getElementById('moveForm')?.addEventListener('submit', handleMoveSubmit);

    document.getElementById('gamesLoginBtn')?.addEventListener('click', handleLoginRedirect);
    document.getElementById('gamesRegisterBtn')?.addEventListener('click', handleRegisterRedirect);
    document.getElementById('gamesLogoutBtn')?.addEventListener('click', handleLogout);
    document.getElementById('gamesLoginBtnMobile')?.addEventListener('click', () => {
      handleLoginRedirect();
      closeMobileMenu();
    });
    document.getElementById('gamesRegisterBtnMobile')?.addEventListener('click', () => {
      handleRegisterRedirect();
      closeMobileMenu();
    });
    document.getElementById('gamesLogoutBtnMobile')?.addEventListener('click', () => {
      handleLogout();
      closeMobileMenu();
    });

    setState({ matchId: parseMatchId() }, 'init:matchId');
    if (!state.matchId) {
      setMessageVisible(true, 'Не удалось найти ID партии в URL. Проверьте ссылку.');
      renderBoard();
      return;
    }

    await fetchCurrentUser();
    await loadMatch();
  }

  // Mobile menu functions теперь в mobile-menu.js

  // Очистка polling при закрытии страницы
  window.addEventListener('beforeunload', () => {
    stopGamePolling();
  });

  document.addEventListener('DOMContentLoaded', init);
})();

