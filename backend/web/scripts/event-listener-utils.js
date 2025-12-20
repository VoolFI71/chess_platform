// Event listener utilities - управление event listeners для предотвращения утечек памяти
(() => {
  'use strict';

  /**
   * Менеджер event listeners с автоматической очисткой
   */
  class EventListenerManager {
    constructor() {
      this.listeners = new Map(); // element -> Set<{type, handler, options}>
    }

    /**
     * Добавляет event listener с автоматическим отслеживанием
     * @param {HTMLElement|Window|Document} element - Элемент
     * @param {string} type - Тип события
     * @param {Function} handler - Обработчик
     * @param {Object|boolean} [options] - Опции addEventListener
     * @returns {Function} - Функция для удаления этого конкретного listener
     */
    add(element, type, handler, options = false) {
      if (!element) return () => {};

      if (!this.listeners.has(element)) {
        this.listeners.set(element, new Set());
      }

      const listenerInfo = { type, handler, options };
      this.listeners.get(element).add(listenerInfo);

      element.addEventListener(type, handler, options);

      // Возвращаем функцию для удаления только этого listener
      return () => {
        this.remove(element, type, handler, options);
      };
    }

    /**
     * Удаляет конкретный event listener
     * @param {HTMLElement|Window|Document} element - Элемент
     * @param {string} type - Тип события
     * @param {Function} handler - Обработчик
     * @param {Object|boolean} [options] - Опции removeEventListener
     */
    remove(element, type, handler, options = false) {
      if (!element || !this.listeners.has(element)) return;

      const elementListeners = this.listeners.get(element);
      const listenerInfo = { type, handler, options };

      if (elementListeners.has(listenerInfo)) {
        element.removeEventListener(type, handler, options);
        elementListeners.delete(listenerInfo);

        if (elementListeners.size === 0) {
          this.listeners.delete(element);
        }
      }
    }

    /**
     * Удаляет все listeners для конкретного элемента
     * @param {HTMLElement|Window|Document} element - Элемент
     */
    removeAllForElement(element) {
      if (!element || !this.listeners.has(element)) return;

      const elementListeners = this.listeners.get(element);
      elementListeners.forEach(({ type, handler, options }) => {
        element.removeEventListener(type, handler, options);
      });

      this.listeners.delete(element);
    }

    /**
     * Удаляет все listeners определенного типа для элемента
     * @param {HTMLElement|Window|Document} element - Элемент
     * @param {string} type - Тип события
     */
    removeAllOfType(element, type) {
      if (!element || !this.listeners.has(element)) return;

      const elementListeners = this.listeners.get(element);
      const toRemove = [];

      elementListeners.forEach((listenerInfo) => {
        if (listenerInfo.type === type) {
          element.removeEventListener(
            listenerInfo.type,
            listenerInfo.handler,
            listenerInfo.options
          );
          toRemove.push(listenerInfo);
        }
      });

      toRemove.forEach((info) => elementListeners.delete(info));

      if (elementListeners.size === 0) {
        this.listeners.delete(element);
      }
    }

    /**
     * Очищает все listeners
     */
    clear() {
      this.listeners.forEach((elementListeners, element) => {
        elementListeners.forEach(({ type, handler, options }) => {
          element.removeEventListener(type, handler, options);
        });
      });
      this.listeners.clear();
    }

    /**
     * Возвращает количество отслеживаемых listeners
     * @returns {number}
     */
    size() {
      let total = 0;
      this.listeners.forEach((elementListeners) => {
        total += elementListeners.size;
      });
      return total;
    }
  }

  // Глобальный менеджер для использования по умолчанию
  const globalManager = new EventListenerManager();

  /**
   * Создает новый менеджер listeners
   * @returns {EventListenerManager}
   */
  function createManager() {
    return new EventListenerManager();
  }

  // Export
  window.EventListenerUtils = {
    createManager,
    // Методы для работы с глобальным менеджером
    add: (element, type, handler, options) => globalManager.add(element, type, handler, options),
    remove: (element, type, handler, options) => globalManager.remove(element, type, handler, options),
    removeAllForElement: (element) => globalManager.removeAllForElement(element),
    removeAllOfType: (element, type) => globalManager.removeAllOfType(element, type),
    clear: () => globalManager.clear(),
    size: () => globalManager.size(),
  };
})();
