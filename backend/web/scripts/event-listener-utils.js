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

    _optionsEqual(a, b) {
      // options может быть boolean или объект.
      // Для объектов сравниваем по ссылке (как работает removeEventListener).
      if (a === b) return true;
      const aIsBool = typeof a === 'boolean';
      const bIsBool = typeof b === 'boolean';
      if (aIsBool || bIsBool) {
        return !!a === !!b;
      }
      return false;
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
        // Важно: удаляем именно тот listenerInfo, который добавили (объекты в Set сравниваются по ссылке)
        this.remove(element, type, handler, options, listenerInfo);
      };
    }

    /**
     * Удаляет конкретный event listener
     * @param {HTMLElement|Window|Document} element - Элемент
     * @param {string} type - Тип события
     * @param {Function} handler - Обработчик
     * @param {Object|boolean} [options] - Опции removeEventListener
     */
    remove(element, type, handler, options = false, _listenerInfoRef = null) {
      if (!element || !this.listeners.has(element)) return;

      const elementListeners = this.listeners.get(element);

      // Быстрый путь: если нам передали ссылку на listenerInfo (из add()), удаляем по ссылке.
      if (_listenerInfoRef && elementListeners.has(_listenerInfoRef)) {
        element.removeEventListener(_listenerInfoRef.type, _listenerInfoRef.handler, _listenerInfoRef.options);
        elementListeners.delete(_listenerInfoRef);
      } else {
        // Медленный путь: ищем совпадение по полям (type/handler/options).
        let found = null;
        elementListeners.forEach((info) => {
          if (found) return;
          if (info.type === type && info.handler === handler && this._optionsEqual(info.options, options)) {
            found = info;
          }
        });
        if (found) {
          element.removeEventListener(found.type, found.handler, found.options);
          elementListeners.delete(found);
        }
      }

      if (elementListeners.size === 0) {
        this.listeners.delete(element);
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

  // Создаем неймспейс App если его еще нет
  if (!window.App) {
    window.App = {};
  }
  if (!window.App.Events) {
    window.App.Events = {};
  }

  // Export в новый неймспейс
  window.App.Events = {
    createManager,
    // Методы для работы с глобальным менеджером
    add: (element, type, handler, options) => globalManager.add(element, type, handler, options),
    remove: (element, type, handler, options) => globalManager.remove(element, type, handler, options),
    removeAllForElement: (element) => globalManager.removeAllForElement(element),
    removeAllOfType: (element, type) => globalManager.removeAllOfType(element, type),
    clear: () => globalManager.clear(),
    size: () => globalManager.size(),
  };

  // Публичный алиас для страниц приложения
  window.EventListenerUtils = window.App.Events;
})();
