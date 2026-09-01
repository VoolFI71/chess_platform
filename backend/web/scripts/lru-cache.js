// LRU Cache implementation для кэширования результатов генерации ходов
(() => {
  'use strict';

  /**
   * LRU Cache - кэш с вытеснением наименее используемых элементов
   * @param {number} maxSize - Максимальный размер кэша
   */
  class LRUCache {
    constructor(maxSize = 100) {
      // Используем приватное поле вместо свойства с getter
      this._maxSize = maxSize;
      // Map сохраняет порядок вставки (в ES6+)
      // Последний использованный элемент находится в конце
      this.cache = new Map();
    }

    /**
     * Получить значение по ключу
     * Перемещает элемент в конец (как последний использованный)
     * @param {string} key - Ключ
     * @returns {*} Значение или undefined
     */
    get(key) {
      if (!this.cache.has(key)) {
        return undefined;
      }
      // Перемещаем элемент в конец (LRU: последний использованный)
      const value = this.cache.get(key);
      this.cache.delete(key);
      this.cache.set(key, value);
      return value;
    }

    /**
     * Установить значение по ключу
     * Если кэш переполнен, удаляет наименее используемый элемент (первый в Map)
     * @param {string} key - Ключ
     * @param {*} value - Значение
     */
    set(key, value) {
      if (this.cache.has(key)) {
        // Обновляем существующий элемент - перемещаем в конец
        this.cache.delete(key);
      } else if (this.cache.size >= this._maxSize) {
        // Удаляем наименее используемый элемент (первый в Map)
        const firstKey = this.cache.keys().next().value;
        if (firstKey !== undefined) {
          this.cache.delete(firstKey);
        }
      }
      this.cache.set(key, value);
    }

    /**
     * Проверить наличие ключа в кэше
     * @param {string} key - Ключ
     * @returns {boolean}
     */
    has(key) {
      return this.cache.has(key);
    }

    /**
     * Удалить элемент по ключу
     * @param {string} key - Ключ
     * @returns {boolean} true если элемент был удален
     */
    delete(key) {
      return this.cache.delete(key);
    }

    /**
     * Очистить кэш
     */
    clear() {
      this.cache.clear();
    }

    /**
     * Получить текущий размер кэша
     * @returns {number}
     */
    get size() {
      return this.cache.size;
    }

    /**
     * Получить максимальный размер кэша
     * @returns {number}
     */
    get maxSize() {
      return this._maxSize;
    }
  }

  // Экспорт
  if (!window.App) {
    window.App = {};
  }
  if (!window.App.Utils) {
    window.App.Utils = {};
  }

  window.App.Utils.LRUCache = LRUCache;

})();

