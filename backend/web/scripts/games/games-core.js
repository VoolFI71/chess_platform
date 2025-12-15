// Games Core - State and initialization
(() => {
  // Global state
  window.GamesState = {
    games: [],
    waitingGames: [],
    liveGames: [],
    finishedGames: [],
    selectedGameId: null,
    selectedGame: null,
    moves: [],
    ws: null,
    lastStateTimestamp: null,
    clockTimer: null,
    currentUser: null,
    pendingGameId: new URLSearchParams(window.location.search).get('game'),
    activeTab: 'quick',
  };

  // Player usernames cache
  window.GamesPlayerUsernames = new Map();
  window.GamesPendingUsernameRequests = new Map();

  // Export state getter
  window.getGamesState = () => window.GamesState;
})();
