(() => {
  'use strict';

  const state = window.ComputerGameState;
  const api = window.ComputerGameApi;
  const ws = window.ComputerGameWebSocket;

  if (!state || !api || !ws) {
    return;
  }

  // Инициализация
  function init() {
    setupEventListeners();
    loadUserInfo();
  }

  // Функция конвертации ELO в уровень Stockfish (0-20)
  // ВАЖНО: Stockfish НЕ имеет официальной формулы конвертации ELO в Skill Level
  // Используем эмпирическую формулу на основе различных источников:
  // Skill Level 0 ≈ 1320-1350 ELO, Skill Level 20 ≈ 2850-3190 ELO
  // Формула: Skill Level = (Elo - 1350) / 75 (приблизительная)
  function eloToStockfishLevel(elo) {
    // Эмпирические значения (не из официальной документации!)
    const baseElo = 1350; // Приблизительный базовый ELO для skill level 0
    const eloPerLevel = 75; // Приблизительное увеличение ELO на уровень
    
    // Конвертируем по эмпирической формуле
    let level = Math.round((elo - baseElo) / eloPerLevel);
    
    // Ограничиваем диапазон 0-20
    level = Math.max(0, Math.min(20, level));
    
    return level;
  }

  // Функция конвертации уровня Stockfish (0-20) обратно в ELO
  // ВАЖНО: Эмпирическая формула (не из официальной документации!)
  function stockfishLevelToElo(level) {
    // Обратная эмпирическая формула: Elo = 1350 + (Skill Level * 75)
    // Приблизительные значения: Skill Level 0 ≈ 1350 ELO, Skill Level 20 ≈ 2850 ELO
    const baseElo = 1350; // Приблизительный базовый ELO для skill level 0
    const eloPerLevel = 75; // Приблизительное увеличение ELO на уровень
    
    const clampedLevel = Math.max(0, Math.min(20, level));
    const elo = Math.round(baseElo + (clampedLevel * eloPerLevel));
    
    return elo;
  }

  // Функция форматирования уровня сложности для отображения
  function formatDifficultyLevel(aiLevel) {
    if (typeof aiLevel === 'undefined' || aiLevel === null) {
      return 'Stockfish 1600';
    }
    
    const elo = stockfishLevelToElo(aiLevel);
    
    return `Stockfish ${elo}`;
  }

  // Настройка обработчиков событий
  function setupEventListeners() {
    // Кнопка начала игры
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
      startBtn.addEventListener('click', handleStartGame);
    }

    // Выбор цвета
    const colorBtns = document.querySelectorAll('.color-btn');
    colorBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        colorBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
      });
    });

    // Выбор уровня сложности через слайдер ELO
    const eloSlider = document.getElementById('eloSlider');
    const eloValue = document.getElementById('eloValue');

    // Обновление отображаемого значения ELO
    function updateEloDisplay(elo) {
      if (eloValue) {
        eloValue.textContent = elo;
      }
    }

    // Обработчик для слайдера
    if (eloSlider) {
      // Обновляем отображение при изменении слайдера
      eloSlider.addEventListener('input', (e) => {
        const elo = parseInt(e.target.value, 10);
        updateEloDisplay(elo);
      });
      
      // Инициализируем отображение начального значения
      updateEloDisplay(parseInt(eloSlider.value, 10));
    }

    // Кнопка сдачи
    const resignBtn = document.getElementById('resignBtn');
    if (resignBtn) {
      resignBtn.addEventListener('click', handleResign);
    }

    // Кнопка новой игры
    const newGameBtn = document.getElementById('newGameBtn');
    if (newGameBtn) {
      newGameBtn.addEventListener('click', handleNewGame);
    }

    // Навигация по ходам
    const prevBtn = document.getElementById('prevMoveBtn');
    const nextBtn = document.getElementById('nextMoveBtn');
    if (prevBtn) {
      prevBtn.addEventListener('click', () => navigateMoves(-1));
    }
    if (nextBtn) {
      nextBtn.addEventListener('click', () => navigateMoves(1));
    }
  }

  // Загрузить информацию о пользователе
  function loadUserInfo() {
    // Используем существующую логику из auth.js
    if (window.updateAuthUI) {
      window.updateAuthUI();
    }
  }

  // Начать игру
  async function handleStartGame() {
    const startBtn = document.getElementById('startGameBtn');
    if (startBtn) {
      startBtn.disabled = true;
      startBtn.textContent = 'Создание игры...';
    }

    try {
      // Получаем выбранные настройки
      const colorBtn = document.querySelector('.color-btn.active');
      
      if (!colorBtn) {
        throw new Error('Выберите цвет фигур');
      }

      const playerColor = colorBtn.dataset.color;
      
      // Получаем ELO из слайдера
      const eloSlider = document.getElementById('eloSlider');
      if (!eloSlider) {
        throw new Error('Слайдер ELO не найден');
      }
      
      const elo = parseInt(eloSlider.value, 10);
      
      // Конвертируем ELO в уровень Stockfish
      const aiLevel = eloToStockfishLevel(elo);

      // Если выбран случайный цвет, определяем его
      let finalColor = playerColor;
      if (playerColor === 'random') {
        finalColor = Math.random() < 0.5 ? 'white' : 'black';
      }

      state.setPlayerColor(finalColor);
      state.setDifficulty(aiLevel);

      // Создаем игру
      const game = await api.createComputerGame(finalColor, aiLevel);
      
      // Сохраняем уровень сложности в state
      state.setDifficulty(aiLevel);
      
      state.setGame(game);
      state.setMoves(game.moves || []);
      state.setGameStatus('active');

      // Подключаемся к WebSocket
      ws.connect(game.id);

      // Переключаемся на экран игры
      showGameScreen();

      // Если AI ходит первым, ждем его хода
      if (game.metadata?.ai_color === 'white') {
        showToast('Компьютер думает...', 'info');
      }
    } catch (error) {
      showToast(error.message || 'Не удалось создать игру', 'error');
      
      if (startBtn) {
        startBtn.disabled = false;
        startBtn.innerHTML = '<i class="fas fa-play"></i> Начать игру';
      }
    }
  }

  // Показать экран игры
  function showGameScreen() {
    const setupScreen = document.getElementById('setupScreen');
    const gameScreen = document.getElementById('gameScreen');
    
    if (setupScreen) setupScreen.style.display = 'none';
    if (gameScreen) gameScreen.style.display = 'block';

    // Обновляем UI
    updateGameInfo();
    updateMoves();
    renderBoard();
  }

  // Показать экран настроек
  function showSetupScreen() {
    const setupScreen = document.getElementById('setupScreen');
    const gameScreen = document.getElementById('gameScreen');
    
    if (setupScreen) setupScreen.style.display = 'block';
    if (gameScreen) gameScreen.style.display = 'none';

    // Сбрасываем состояние
    state.reset();
    ws.disconnect();
  }

  // Обновить информацию об игре
  function updateGameInfo() {
    const game = state.getGame();
    if (!game) return;

    const playerColor = state.getPlayerColor();
    const aiColor = state.getAIColor();

    // Получаем уровень сложности AI из metadata или state
    const aiLevel = game.metadata?.ai_level || state.getDifficulty();
    const difficultyText = formatDifficultyLevel(aiLevel);

    // Обновляем имена игроков
    const topLabel = document.getElementById('topPlayerLabel');
    const bottomLabel = document.getElementById('bottomPlayerLabel');
    const topLabelMobile = document.getElementById('topPlayerLabelMobile');
    const bottomLabelMobile = document.getElementById('bottomPlayerLabelMobile');

    if (playerColor === 'white') {
      if (topLabel) topLabel.textContent = difficultyText;
      if (bottomLabel) bottomLabel.textContent = 'Вы';
      if (topLabelMobile) topLabelMobile.textContent = difficultyText;
      if (bottomLabelMobile) bottomLabelMobile.textContent = 'Вы';
    } else {
      if (topLabel) topLabel.textContent = 'Вы';
      if (bottomLabel) bottomLabel.textContent = difficultyText;
      if (topLabelMobile) topLabelMobile.textContent = 'Вы';
      if (bottomLabelMobile) bottomLabelMobile.textContent = difficultyText;
    }

    // Обновляем статус игры
    if (game.status === 'FINISHED') {
      showGameResult(game);
    }
  }

  // Показать результат игры
  function showGameResult(game) {
    const playerColor = state.getPlayerColor();
    let message = '';
    if (game.result === '1-0') {
      message = playerColor === 'white' ? 'Вы выиграли!' : 'Компьютер выиграл!';
    } else if (game.result === '0-1') {
      message = playerColor === 'black' ? 'Вы выиграли!' : 'Компьютер выиграл!';
    } else {
      message = 'Ничья!';
    }
    showToast(message, 'info');
  }

  // Обновить список ходов
  function updateMoves() {
    const movesList = document.getElementById('movesList');
    if (!movesList) return;

    const moves = state.getMoves();
    const moveIndex = state.getCurrentMoveIndex();

    movesList.innerHTML = '';

    for (let i = 0; i < moves.length; i += 2) {
      const moveNum = Math.floor(i / 2) + 1;
      const whiteMove = moves[i];
      const blackMove = moves[i + 1];

      const li = document.createElement('li');
      li.className = 'move-item';
      if (i <= moveIndex && (i + 1) <= moveIndex) {
        li.classList.add('viewed');
      }

      const moveNumSpan = document.createElement('span');
      moveNumSpan.className = 'move-number';
      moveNumSpan.textContent = `${moveNum}.`;

      const whiteSpan = document.createElement('span');
      whiteSpan.className = 'move-white';
      whiteSpan.textContent = whiteMove?.san || '—';
      if (i === moveIndex - 1) {
        whiteSpan.classList.add('current');
      }

      const blackSpan = document.createElement('span');
      blackSpan.className = 'move-black';
      blackSpan.textContent = blackMove?.san || '—';
      if (i + 1 === moveIndex - 1) {
        blackSpan.classList.add('current');
      }

      li.appendChild(moveNumSpan);
      li.appendChild(whiteSpan);
      li.appendChild(blackSpan);
      movesList.appendChild(li);
    }
  }

  // Навигация по ходам
  function navigateMoves(direction) {
    const currentIndex = state.getCurrentMoveIndex();
    const moves = state.getMoves();
    const newIndex = Math.max(0, Math.min(moves.length, currentIndex + direction));
    
    state.setCurrentMoveIndex(newIndex);
    // Предгенерируем ходы перед рендерингом
    if (window.ComputerGameBoard && window.ComputerGameBoard.updateLegalMoves) {
      window.ComputerGameBoard.updateLegalMoves();
    }
    renderBoard();
    updateMoves();
  }

  // Отрисовать доску
  function renderBoard() {
    if (window.renderComputerGameBoard) {
      window.renderComputerGameBoard();
    }
  }

  // Сдача
  function handleResign() {
    if (!confirm('Вы уверены, что хотите сдаться?')) {
      return;
    }
    // TODO: Реализовать сдачу через API
    showToast('Функция сдачи будет реализована позже', 'info');
  }

  // Новая игра
  function handleNewGame() {
    if (confirm('Начать новую игру? Текущая игра будет завершена.')) {
      showSetupScreen();
    }
  }

  // Показать уведомление
  function showToast(message, type = 'info') {
    const toast = document.getElementById('gamesToast');
    if (!toast) return;
    toast.textContent = message;
    toast.className = `toast show ${type === 'error' ? 'error' : ''}`;
    setTimeout(() => {
      toast.className = 'toast';
    }, 4000);
  }

  // Экспортируем функции для использования в других модулях
  window.updateComputerGameMoves = updateMoves;
  window.updateComputerGameInfo = updateGameInfo;

  // Инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

