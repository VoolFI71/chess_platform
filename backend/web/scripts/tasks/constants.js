(() => {
  window.TasksConstants = {
    API_ENDPOINTS: {
      stats: '/api/puzzles/stats/me',
      randomPuzzle: '/api/puzzles/random',
      attempts: '/api/puzzles/attempts/',
    },

    MODES: [
      {
        id: 'survival',
        name: 'Выживание',
        description: 'Случайные задачи без рейтинга. Идеально для длинных марафонов и свободной практики.',
        icon: 'fa-heartbeat',
        requiresAuth: true,
      },
      {
        id: 'rated',
        name: 'На рейтинг',
        description: 'Подбор задач по вашему puzzle rating. Ошибки и успехи влияют на статистику и серии.',
        icon: 'fa-trophy',
        requiresAuth: true,
      },
      {
        id: 'marathon',
        name: 'Марафон',
        description: 'Задачи начинаются с рейтинга ~1000 и повышаются по мере решения. Идеально для длительных тренировок.',
        icon: 'fa-running',
        requiresAuth: false,
      },
    ],

    PIECES: {
      K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
      k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
    },
  };
})();

