(() => {
  window.TasksConstants = {
    API_ENDPOINTS: {
      stats: '/api/puzzles/stats/me',
      randomPuzzle: '/api/puzzles/random',
      attempts: '/api/puzzles/attempts/',
    },

    MODES: [
      {
        id: 'marathon',
        name: 'Марафон',
        description: 'Задачи начинаются с рейтинга ~1000 и быстро усложняются по мере решения.',
        icon: 'fa-running',
        requiresAuth: false,
      },
      {
        id: 'survival',
        name: 'Выживание',
        description: 'Случайные шахматные задачи различной сложности. Идеально для свободной практики.',
        icon: 'fa-heartbeat',
        requiresAuth: true,
      },
      {
        id: 'rated',
        name: 'На рейтинг',
        description: 'Подбор шахматных задач по вашему уровню. Решайте с сохранением рейтинга и статистики.',
        icon: 'fa-trophy',
        requiresAuth: true,
      },
    ],

    PIECES: {
      K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
      k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
    },
  };
})();

