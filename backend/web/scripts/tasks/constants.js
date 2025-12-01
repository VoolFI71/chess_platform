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
      },
      {
        id: 'rated',
        name: 'На рейтинг',
        description: 'Подбор задач по вашему puzzle rating. Ошибки и успехи влияют на статистику и серии.',
        icon: 'fa-trophy',
      },
    ],

    PIECES: {
      K: '♔', Q: '♕', R: '♖', B: '♗', N: '♘', P: '♙',
      k: '♚', q: '♛', r: '♜', b: '♝', n: '♞', p: '♟',
    },
  };
})();

