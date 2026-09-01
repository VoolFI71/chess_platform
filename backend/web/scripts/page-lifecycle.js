// Page Lifecycle Management - централизованное управление таймерами и очисткой ресурсов
(() => {
  'use strict';

  /**
   * Менеджер жизненного цикла страницы
   * Автоматически очищает таймеры и ресурсы при уходе со страницы
   */
  class PageLifecycle {
    constructor() {
      this.timers = new Set(); // Set<timerId>
      this.intervals = new Set(); // Set<intervalId>
      this.cleanupCallbacks = []; // Array<Function>
      this.isUnmounting = false;
      
      // Подписываемся на события жизненного цикла страницы
      this.setupListeners();
    }

    /**
     * Настройка слушателей событий жизненного цикла
     */
    setupListeners() {
      // Используем pagehide для более надежного определения ухода со страницы
      // (работает даже при закрытии вкладки, навигации назад/вперед, перезагрузке)
      window.addEventListener('pagehide', () => {
        this.cleanup();
      });

      // beforeunload как дополнительная защита
      window.addEventListener('beforeunload', () => {
        this.cleanup();
      });

      // visibilitychange для паузы таймеров когда страница скрыта
      document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
          this.onPageHidden();
        } else {
          this.onPageVisible();
        }
      });
    }

    /**
     * Регистрация таймера для автоматической очистки
     * @param {number} timerId - ID таймера (из setTimeout)
     * @returns {number} - Тот же timerId для удобства
     */
    registerTimer(timerId) {
      if (this.isUnmounting) {
        clearTimeout(timerId);
        return timerId;
      }
      this.timers.add(timerId);
      return timerId;
    }

    /**
     * Регистрация интервала для автоматической очистки
     * @param {number} intervalId - ID интервала (из setInterval)
     * @returns {number} - Тот же intervalId для удобства
     */
    registerInterval(intervalId) {
      if (this.isUnmounting) {
        clearInterval(intervalId);
        return intervalId;
      }
      this.intervals.add(intervalId);
      return intervalId;
    }

    /**
     * Отмена регистрации таймера (если он был очищен вручную)
     * @param {number} timerId - ID таймера
     */
    unregisterTimer(timerId) {
      this.timers.delete(timerId);
    }

    /**
     * Отмена регистрации интервала (если он был очищен вручную)
     * @param {number} intervalId - ID интервала
     */
    unregisterInterval(intervalId) {
      this.intervals.delete(intervalId);
    }

    /**
     * Регистрация callback для очистки ресурсов
     * @param {Function} callback - Функция очистки
     * @returns {Function} - Функция для отмены регистрации
     */
    onCleanup(callback) {
      if (this.isUnmounting) {
        try {
          callback();
        } catch (e) {
          console.error('Error in cleanup callback:', e);
        }
        return () => {};
      }
      this.cleanupCallbacks.push(callback);
      return () => {
        const index = this.cleanupCallbacks.indexOf(callback);
        if (index > -1) {
          this.cleanupCallbacks.splice(index, 1);
        }
      };
    }

    /**
     * Очистка всех таймеров и ресурсов
     */
    cleanup() {
      if (this.isUnmounting) return;
      this.isUnmounting = true;

      // Очищаем все таймеры
      this.timers.forEach(timerId => {
        clearTimeout(timerId);
      });
      this.timers.clear();

      // Очищаем все интервалы
      this.intervals.forEach(intervalId => {
        clearInterval(intervalId);
      });
      this.intervals.clear();

      // Вызываем все callback'и очистки
      const callbacks = this.cleanupCallbacks;
      this.cleanupCallbacks = [];
      callbacks.forEach(callback => {
        try {
          callback();
        } catch (e) {
          console.error('Error in cleanup callback:', e);
        }
      });
    }

    /**
     * Вызывается когда страница скрыта (visibilitychange)
     */
    onPageHidden() {
      // Можно добавить логику паузы таймеров если нужно
    }

    /**
     * Вызывается когда страница видна (visibilitychange)
     */
    onPageVisible() {
      // Можно добавить логику возобновления таймеров если нужно
    }

    /**
     * Обертка над setTimeout с автоматической регистрацией
     * @param {Function} callback - Функция обратного вызова
     * @param {number} delay - Задержка в миллисекундах
     * @returns {number} - ID таймера
     */
    setTimeout(callback, delay) {
      const timerId = window.setTimeout(() => {
        this.unregisterTimer(timerId);
        callback();
      }, delay);
      return this.registerTimer(timerId);
    }

    /**
     * Обертка над setInterval с автоматической регистрацией
     * @param {Function} callback - Функция обратного вызова
     * @param {number} delay - Интервал в миллисекундах
     * @returns {number} - ID интервала
     */
    setInterval(callback, delay) {
      const intervalId = window.setInterval(callback, delay);
      return this.registerInterval(intervalId);
    }

    /**
     * Обертка над clearTimeout с автоматической отменой регистрации
     * @param {number} timerId - ID таймера
     */
    clearTimeout(timerId) {
      this.unregisterTimer(timerId);
      window.clearTimeout(timerId);
    }

    /**
     * Обертка над clearInterval с автоматической отменой регистрации
     * @param {number} intervalId - ID интервала
     */
    clearInterval(intervalId) {
      this.unregisterInterval(intervalId);
      window.clearInterval(intervalId);
    }

    /**
     * Получить количество зарегистрированных таймеров
     * @returns {number}
     */
    getTimerCount() {
      return this.timers.size;
    }

    /**
     * Получить количество зарегистрированных интервалов
     * @returns {number}
     */
    getIntervalCount() {
      return this.intervals.size;
    }
  }

  // Создаем глобальный экземпляр
  const lifecycle = new PageLifecycle();

  // Экспорт в неймспейс App
  if (!window.App) {
    window.App = {};
  }
  if (!window.App.Utils) {
    window.App.Utils = {};
  }

  window.App.Utils.PageLifecycle = lifecycle;

  // Публичный алиас для страниц приложения
  window.PageLifecycle = lifecycle;
})();

