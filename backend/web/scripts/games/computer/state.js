(() => {
  'use strict';

  // State management для игры с компьютером
  const state = {
    game: null,
    moves: [],
    currentMoveIndex: 0,
    selectedSquare: null,
    availableTargets: new Set(),
    legalMovesByFrom: new Map(), // Предгенерированные легальные ходы
    playerColor: 'white', // Цвет игрока
    aiColor: 'black', // Цвет компьютера
    difficulty: 10, // Уровень сложности AI (1-20)
    boardOrientation: 'white',
    isPlayerTurn: false,
    gameStatus: 'setup', // 'setup', 'active', 'finished'
    ws: null,
    wsConnected: false,
  };

  // Getters
  function getState() {
    return { ...state };
  }

  function getGame() {
    return state.game;
  }

  function getMoves() {
    return [...state.moves];
  }

  function getCurrentMoveIndex() {
    return state.currentMoveIndex;
  }

  function getPlayerColor() {
    return state.playerColor;
  }

  function getAIColor() {
    return state.aiColor;
  }

  function getBoardOrientation() {
    return state.boardOrientation;
  }

  function isPlayerTurn() {
    return state.isPlayerTurn;
  }

  function getGameStatus() {
    return state.gameStatus;
  }

  function isWSConnected() {
    return state.wsConnected;
  }

  function getSelectedSquare() {
    return state.selectedSquare;
  }

  function getAvailableTargets() {
    return new Set(state.availableTargets);
  }

  function getDifficulty() {
    return state.difficulty;
  }

  // Setters
  function setGame(game) {
    state.game = game;
    if (game) {
      // Определяем цвета игрока и AI из metadata
      const metadata = game.metadata || {};
      if (metadata.ai_color) {
        state.aiColor = metadata.ai_color;
        state.playerColor = metadata.ai_color === 'white' ? 'black' : 'white';
      }
      
      // Обновляем уровень сложности из metadata, если он есть
      if (metadata.ai_level !== undefined && metadata.ai_level !== null) {
        state.difficulty = typeof metadata.ai_level === 'number' ? metadata.ai_level : parseInt(metadata.ai_level, 10);
      }
      
      // Определяем ориентацию доски
      state.boardOrientation = state.playerColor;
      
      // Проверяем, чей ход
      const expectedTurn = game.next_turn === 'w' ? 'white' : 'black';
      state.isPlayerTurn = expectedTurn === state.playerColor;
      
      // Обновляем статус игры
      if (game.status === 'FINISHED') {
        state.gameStatus = 'finished';
      } else if (game.status === 'ACTIVE' || game.status === 'CREATED') {
        state.gameStatus = 'active';
      }
    }
  }

  function setMoves(moves) {
    state.moves = moves || [];
    state.currentMoveIndex = state.moves.length;
    state.legalMovesByFrom = new Map(); // Сбрасываем при изменении ходов
  }

  function addMove(move) {
    state.moves.push(move);
    state.currentMoveIndex = state.moves.length;
    state.legalMovesByFrom = new Map(); // Сбрасываем при добавлении хода
  }

  function setCurrentMoveIndex(index) {
    if (index >= 0 && index <= state.moves.length) {
      state.currentMoveIndex = index;
      state.legalMovesByFrom = new Map(); // Сбрасываем при изменении индекса
    }
  }

  function setSelectedSquare(square) {
    state.selectedSquare = square;
  }

  function setAvailableTargets(targets) {
    state.availableTargets = new Set(targets || []);
  }

  function setPlayerColor(color) {
    state.playerColor = color;
    state.aiColor = color === 'white' ? 'black' : 'white';
    state.boardOrientation = color;
  }

  function setDifficulty(level) {
    state.difficulty = level;
  }

  function setGameStatus(status) {
    state.gameStatus = status;
  }

  function setWS(ws) {
    state.ws = ws;
  }

  function setWSConnected(connected) {
    state.wsConnected = connected;
  }

  function updatePlayerTurn() {
    if (!state.game) return;
    const expectedTurn = state.game.next_turn === 'w' ? 'white' : 'black';
    state.isPlayerTurn = expectedTurn === state.playerColor;
  }

  function reset() {
    state.game = null;
    state.moves = [];
    state.currentMoveIndex = 0;
    state.selectedSquare = null;
    state.availableTargets = new Set();
    state.isPlayerTurn = false;
    state.gameStatus = 'setup';
    if (state.ws) {
      state.ws.close();
      state.ws = null;
    }
    state.wsConnected = false;
  }

  // Получить прямой доступ к объекту состояния (для внутреннего использования)
  function getDirectState() {
    return state;
  }

  // Export
  window.ComputerGameState = {
    getState,
    getDirectState, // Добавляем метод для получения прямого доступа к состоянию
    getGame,
    getMoves,
    getCurrentMoveIndex,
    getPlayerColor,
    getAIColor,
    getBoardOrientation,
    getSelectedSquare,
    getAvailableTargets,
    getDifficulty,
    isPlayerTurn,
    getGameStatus,
    isWSConnected,
    setGame,
    setMoves,
    addMove,
    setCurrentMoveIndex,
    setSelectedSquare,
    setAvailableTargets,
    setPlayerColor,
    setDifficulty,
    setGameStatus,
    setWS,
    setWSConnected,
    updatePlayerTurn,
    reset,
  };
})();

