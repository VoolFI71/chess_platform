/**
 * Header Mobile Control
 * Централизованное управление видимостью элементов хедера на мобильных устройствах
 * Этот скрипт должен загружаться ПОСЛЕ auth.js и других скриптов, которые управляют хедером
 * 
 * Этот скрипт агрессивно перехватывает все попытки показать элементы в хедере на мобильных
 */

(function() {
  'use strict';

  const MOBILE_BREAKPOINT = 1024;
  
  // Селекторы элементов, которые должны быть скрыты на мобильных в хедере
  const SELECTORS_TO_HIDE_ON_MOBILE = [
    '#gamesLogoutBtn',
    '.header-actions .logout-btn',
    '.header-actions button.logout-btn',
    '.header-actions .btn.btn-outline.logout-btn',
    '.header-actions .btn-cabinet',
    '.header-actions a.btn-cabinet',
    '#userActions',
    '.header-actions #userActions',
    '#authButtons',
    '.header-actions #authButtons',
    '.header-actions .auth-icon-btn',
    '#gamesUserInfo',
    '.header-actions #gamesUserInfo',
  ];

  /**
   * Проверяет, является ли устройство мобильным
   */
  function isMobile() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }

  /**
   * Проверяет, должен ли элемент быть скрыт на мобильных
   */
  function shouldHideOnMobile(element) {
    if (!element || !element.matches) return false;
    
    return SELECTORS_TO_HIDE_ON_MOBILE.some(selector => {
      try {
        return element.matches(selector);
      } catch (e) {
        return false;
      }
    });
  }

  /**
   * Принудительно скрывает элементы в хедере на мобильных устройствах
   */
  function hideHeaderElementsOnMobile() {
    if (!isMobile()) return;

    SELECTORS_TO_HIDE_ON_MOBILE.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          // Проверяем, что элемент находится в header-actions, а не в mobile-menu
          const isInHeaderActions = element.closest('.header-actions');
          const isInMobileMenu = element.closest('.mobile-menu');
          
          if (isInHeaderActions && !isInMobileMenu) {
            // Принудительно скрываем через inline стили с максимальным приоритетом
            element.style.setProperty('display', 'none', 'important');
            element.style.setProperty('visibility', 'hidden', 'important');
            element.style.setProperty('opacity', '0', 'important');
            element.style.setProperty('width', '0', 'important');
            element.style.setProperty('height', '0', 'important');
            element.style.setProperty('overflow', 'hidden', 'important');
            element.style.setProperty('margin', '0', 'important');
            element.style.setProperty('padding', '0', 'important');
            element.style.setProperty('pointer-events', 'none', 'important');
            element.style.setProperty('position', 'absolute', 'important');
            element.style.setProperty('left', '-9999px', 'important');
            
            // Помечаем эти стили как установленные нашим скриптом
            ['display', 'visibility', 'opacity', 'width', 'height', 'overflow', 'margin', 'padding', 'pointer-events', 'position', 'left'].forEach(prop => {
              markStyleAsOurs(element, prop);
            });
          }
        });
      } catch (e) {
        // Игнорируем ошибки для несуществующих селекторов
        }
    });
  }

  /**
   * Показывает элементы в хедере на десктопе (если они должны быть видны)
   */
  function showHeaderElementsOnDesktop() {
    if (isMobile()) return;

    // На десктопе позволяем другим скриптам управлять видимостью
    // Убираем ТОЛЬКО те стили, которые были установлены нашим скриптом
    SELECTORS_TO_HIDE_ON_MOBILE.forEach(selector => {
      try {
        const elements = document.querySelectorAll(selector);
        elements.forEach(element => {
          const isInHeaderActions = element.closest('.header-actions');
          const isInMobileMenu = element.closest('.mobile-menu');
          
          if (isInHeaderActions && !isInMobileMenu) {
            // Убираем только те стили, которые мы установили
            const properties = ['display', 'visibility', 'opacity', 'width', 'height', 'overflow', 'margin', 'padding', 'pointer-events', 'position', 'left'];
            properties.forEach(prop => {
              if (isOurStyle(element, prop)) {
                element.style.removeProperty(prop);
                unmarkStyleAsOurs(element, prop);
              }
            });
          }
        });
      } catch (e) {
        }
    });
  }

  /**
   * Обновляет видимость элементов в зависимости от размера экрана
   */
  function updateHeaderVisibility() {
    if (isMobile()) {
      hideHeaderElementsOnMobile();
    } else {
      showHeaderElementsOnDesktop();
    }
  }

  /**
   * Глобально перехватывает CSSStyleDeclaration.prototype.setProperty
   * чтобы перехватывать все попытки установить display для элементов в header-actions
   */
  function interceptGlobalStyleSetProperty() {
    const originalSetProperty = CSSStyleDeclaration.prototype.setProperty;
    
    CSSStyleDeclaration.prototype.setProperty = function(property, value, priority) {
      // Если устанавливается display и мы на мобильном
      if (property === 'display' && isMobile() && this.ownerElement) {
        const element = this.ownerElement;
        const isInHeaderActions = element.closest('.header-actions');
        const isInMobileMenu = element.closest('.mobile-menu');
        
        // Если элемент должен быть скрыт на мобильных и находится в header-actions
        if (isInHeaderActions && !isInMobileMenu && shouldHideOnMobile(element)) {
          // Игнорируем установку display, если значение не 'none'
          if (value !== 'none' && priority !== 'important') {
            // Устанавливаем 'none' с important вместо исходного значения
            return originalSetProperty.call(this, 'display', 'none', 'important');
          }
        }
      }
      
      // Для всех остальных случаев вызываем оригинальный метод
      return originalSetProperty.call(this, property, value, priority);
    };
  }
  
  // Отслеживаем, какие стили были установлены нашим скриптом
  const ourStyles = new WeakMap();
  
  /**
   * Помечает стиль как установленный нашим скриптом
   */
  function markStyleAsOurs(element, property) {
    if (!ourStyles.has(element)) {
      ourStyles.set(element, new Set());
    }
    ourStyles.get(element).add(property);
  }
  
  /**
   * Проверяет, был ли стиль установлен нашим скриптом
   */
  function isOurStyle(element, property) {
    return ourStyles.has(element) && ourStyles.get(element).has(property);
  }
  
  /**
   * Убирает пометку о том, что стиль был установлен нашим скриптом
   */
  function unmarkStyleAsOurs(element, property) {
    if (ourStyles.has(element)) {
      ourStyles.get(element).delete(property);
    }
  }

  /**
   * Глобально перехватывает прямое присваивание style.display
   */
  function interceptGlobalStyleDisplay() {
    // Перехватываем через Object.defineProperty для всех элементов в header-actions
    const originalDefineProperty = Object.defineProperty;
    
    // Создаем прокси для всех элементов при их создании
    const wrapElement = (element) => {
      if (element._mobileControlWrapped) return;
      element._mobileControlWrapped = true;
      
      const originalStyle = element.style;
      const styleProxy = new Proxy(originalStyle, {
        set(target, prop, value) {
          // Если устанавливается display и мы на мобильном
          if (prop === 'display' && isMobile()) {
            const isInHeaderActions = element.closest('.header-actions');
            const isInMobileMenu = element.closest('.mobile-menu');
            
            if (isInHeaderActions && !isInMobileMenu && shouldHideOnMobile(element)) {
              if (value !== 'none') {
                // Игнорируем установку и принудительно скрываем
                target.setProperty('display', 'none', 'important');
                return true;
              }
            }
          }
          
          return Reflect.set(target, prop, value);
        },
        get(target, prop) {
          return Reflect.get(target, prop);
        }
      });
      
      try {
        Object.defineProperty(element, 'style', {
          get: () => styleProxy,
          configurable: true
        });
      } catch (e) {
        // Не можем перехватить, игнорируем
      }
    };
    
    // Обёртываем существующие элементы
    function wrapExistingElements() {
      SELECTORS_TO_HIDE_ON_MOBILE.forEach(selector => {
        try {
          const elements = document.querySelectorAll(selector);
          elements.forEach(element => {
            const isInHeaderActions = element.closest('.header-actions');
            const isInMobileMenu = element.closest('.mobile-menu');
            
            if (isInHeaderActions && !isInMobileMenu) {
              wrapElement(element);
            }
          });
        } catch (e) {
          // Игнорируем ошибки
        }
      });
    }
    
    return wrapExistingElements;
  }

  /**
   * Наблюдает за изменениями DOM и скрывает элементы, если они появляются на мобильных
   */
  function observeHeaderChanges() {
    if (!window.MutationObserver) return null;

    const observer = new MutationObserver((mutations) => {
      mutations.forEach(mutation => {
        // Обрабатываем добавленные узлы
        mutation.addedNodes.forEach(node => {
          if (node.nodeType === 1) { // Element node
            const isInHeaderActions = node.closest('.header-actions');
            const isInMobileMenu = node.closest('.mobile-menu');
            
            if (isInHeaderActions && !isInMobileMenu && shouldHideOnMobile(node)) {
              if (isMobile()) {
                hideHeaderElementsOnMobile();
              }
            }
          }
        });
        
        // Обрабатываем изменения атрибутов style
        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const target = mutation.target;
          const isInHeaderActions = target.closest('.header-actions');
          const isInMobileMenu = target.closest('.mobile-menu');
          
          if (isInHeaderActions && !isInMobileMenu && isMobile() && shouldHideOnMobile(target)) {
            hideHeaderElementsOnMobile();
          }
        }
      });
      
      if (isMobile()) {
        setTimeout(hideHeaderElementsOnMobile, 0);
      }
    });

    // Наблюдаем за изменениями в header-actions
    function startObserving() {
      const headerActions = document.querySelectorAll('.header-actions');
      headerActions.forEach(container => {
        observer.observe(container, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['style', 'class']
        });
      });
    }
    
    startObserving();
    
    // Также начинаем наблюдение после загрузки DOM
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', startObserving);
    }
    
    return observer;
  }

  // Инициализация
  let checkInterval = null;
  let resizeHandler = null;

  function init() {
    // Глобально перехватываем установку стилей
    interceptGlobalStyleSetProperty();
    
    // Обновляем видимость сразу
    updateHeaderVisibility();

    // Обновляем при изменении размера окна
    let resizeTimeout;
    resizeHandler = () => {
      clearTimeout(resizeTimeout);
      resizeTimeout = setTimeout(updateHeaderVisibility, 100);
    };
    window.addEventListener('resize', resizeHandler);

    // Наблюдаем за изменениями DOM
    const observer = observeHeaderChanges();
    
    // Обёртываем существующие элементы для перехвата style.display
    const wrapExisting = interceptGlobalStyleDisplay();
    wrapExisting();
    
    // Периодически проверяем и обёртываем новые элементы
    // Увеличиваем частоту проверки для более агрессивного контроля
    checkInterval = setInterval(() => {
      if (isMobile()) {
        hideHeaderElementsOnMobile();
        wrapExisting(); // Обёртываем новые элементы
      }
    }, 150);

    // Также обновляем после полной загрузки страницы
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        updateHeaderVisibility();
        wrapExisting();
      });
    } else {
      updateHeaderVisibility();
      wrapExisting();
    }

    // Обновляем после загрузки всех скриптов
    window.addEventListener('load', () => {
      setTimeout(() => {
        updateHeaderVisibility();
        wrapExisting();
        // Дополнительная проверка после всех скриптов
        setTimeout(() => {
          if (isMobile()) {
            hideHeaderElementsOnMobile();
          }
        }, 300);
      }, 200);
    });
  }

  // Запускаем инициализацию как можно раньше
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    // Если DOM уже загружен, запускаем сразу
    init();
  }

  // Очистка при размонтировании
  function cleanup() {
    if (checkInterval) {
      clearInterval(checkInterval);
      checkInterval = null;
    }
    if (resizeHandler) {
      window.removeEventListener('resize', resizeHandler);
      resizeHandler = null;
    }
  }

  // Очищаем при уходе со страницы
  window.addEventListener('beforeunload', cleanup);

  // Экспортируем функцию для ручного вызова, если нужно
  window.updateHeaderMobileVisibility = updateHeaderVisibility;
  window.hideHeaderElementsOnMobile = hideHeaderElementsOnMobile;
  window.cleanupHeaderMobileControl = cleanup;
})();
