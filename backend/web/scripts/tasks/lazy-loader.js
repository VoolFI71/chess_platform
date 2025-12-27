/**
 * Ленивая загрузка модулей для страницы tasks
 * Загружает тяжелые модули только когда они действительно нужны
 */

(() => {
  // Кеш загруженных модулей
  const loadedModules = new Set();
  const loadingPromises = new Map();

  /**
   * Загружает скрипт динамически
   */
  function loadScript(src) {
    return new Promise((resolve, reject) => {
      // Проверяем, не загружен ли уже модуль
      if (loadedModules.has(src)) {
        resolve();
        return;
      }

      // Проверяем, не загружается ли уже модуль
      if (loadingPromises.has(src)) {
        loadingPromises.get(src).then(resolve).catch(reject);
        return;
      }

      // Создаем promise для загрузки
      const promise = new Promise((resolveInner, rejectInner) => {
        const script = document.createElement('script');
        script.src = src;
        script.async = false; // Отключаем async для сохранения порядка загрузки
        
        script.onload = () => {
          loadedModules.add(src);
          loadingPromises.delete(src);
          resolveInner();
        };
        
        script.onerror = () => {
          loadingPromises.delete(src);
          rejectInner(new Error(`Failed to load script: ${src}`));
        };
        
        document.head.appendChild(script);
      });

      loadingPromises.set(src, promise);
      promise.then(resolve).catch(reject);
    });
  }

  /**
   * Загружает модули для работы с доской (когда пользователь выбирает режим)
   */
  window.loadBoardModules = async function() {
    const modules = [
      '/scripts/lru-cache.js', // LRU кэш для оптимизации генерации ходов
      '/scripts/chess-move-utils.js',
      '/scripts/chess-board-core.js',
      '/scripts/chess-pieces-svg.js',
      '/scripts/tasks/board.js',
      '/scripts/tasks/moves.js',
      '/scripts/tasks/history.js',
      '/scripts/tasks/animations.js', // Загружаем анимации вместе с модулями доски
    ];

    try {
      // Загружаем последовательно, чтобы гарантировать порядок выполнения
      for (const module of modules) {
        await loadScript(module);
      }
    } catch (error) {
      throw error;
    }
  };

  /**
   * Загружает модуль анимаций (когда нужны анимации)
   */
  window.loadAnimationModule = async function() {
    try {
      await loadScript('/scripts/tasks/animations.js');
      } catch (error) {
      throw error;
    }
  };

  /**
   * Проверяет, загружен ли модуль
   */
  window.isModuleLoaded = function(src) {
    return loadedModules.has(src);
  };
})();

