// Real-time notifications via WebSocket
(function () {
  'use strict';

  let wsConnection = null;
  const toastTimers = new Map(); // Храним таймеры для toast-уведомлений

  // Получаем токен из auth.js или localStorage
  function getAccessToken() {
    if (window.getAccessToken && typeof window.getAccessToken === 'function') {
      return window.getAccessToken();
    }
    try {
      return localStorage.getItem('access_token') || '';
    } catch {
      return '';
    }
  }

  // Проверяем, авторизован ли пользователь
  function isAuthenticated() {
    const token = getAccessToken();
    return !!token;
  }

  // Подключение к WebSocket
  function connect() {
    if (!isAuthenticated()) {
      return;
    }

    // Проверяем наличие WebSocketUtils
    if (!window.WebSocketUtils || typeof window.WebSocketUtils.createWebSocketUrl !== 'function') {
      console.warn('WebSocketUtils не загружен, уведомления недоступны');
      return;
    }

    // Отключаемся от предыдущего подключения, если есть
    if (wsConnection) {
      disconnect();
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    const url = window.WebSocketUtils.createWebSocketUrl('/ws/notifications', { token });

    if (!window.WebSocketUtils.createWebSocketConnection) {
      console.warn('createWebSocketConnection не доступен');
      return;
    }

    wsConnection = window.WebSocketUtils.createWebSocketConnection({
      url,
      onMessage: (message) => {
        if (message.type === 'notification') {
          handleNotification(message);
        } else if (message === 'pong') {
          // Ответ на ping
        }
      },
      onConnect: () => {
        updateConnectionStatus(true);
      },
      onDisconnect: () => {
        updateConnectionStatus(false);
      },
      onError: () => {
        updateConnectionStatus(false);
      },
      maxReconnectAttempts: 5,
      baseDelay: 3000,
      maxDelay: 30000,
    });
  }

  // Отключение от WebSocket
  function disconnect() {
    if (wsConnection) {
      wsConnection.disconnect();
      wsConnection = null;
    }
    // Очищаем все таймеры toast-уведомлений
    toastTimers.forEach((timer) => {
      clearTimeout(timer);
    });
    toastTimers.clear();
    updateConnectionStatus(false);
  }

  // Обработка входящего уведомления
  function handleNotification(data) {
    // Показываем уведомление в UI
    showNotificationToast(data);

    // Обновляем счетчик непрочитанных
    updateUnreadCount();

    // Отправляем событие для других частей приложения
    window.dispatchEvent(new CustomEvent('notification-received', { detail: data }));
  }

  // Показ toast-уведомления
  function showNotificationToast(notification) {
    // Создаем элемент уведомления
    const toast = document.createElement('div');
    toast.className = 'notification-toast';
    toast.setAttribute('data-notification-id', notification.id);
    
    const icon = getNotificationIcon(notification.notification_type);
    const time = new Date(notification.created_at).toLocaleTimeString('ru-RU', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });

    // Создаем структуру через DOM API для безопасности
    const content = document.createElement('div');
    content.className = 'notification-toast-content';
    
    const iconDiv = document.createElement('div');
    iconDiv.className = 'notification-toast-icon';
    iconDiv.innerHTML = icon; // Иконка - статический HTML
    
    const body = document.createElement('div');
    body.className = 'notification-toast-body';
    
    const title = document.createElement('div');
    title.className = 'notification-toast-title';
    title.textContent = notification.title || '';
    
    const message = document.createElement('div');
    message.className = 'notification-toast-message';
    message.textContent = notification.message || '';
    
    const timeDiv = document.createElement('div');
    timeDiv.className = 'notification-toast-time';
    timeDiv.textContent = time;
    
    body.appendChild(title);
    body.appendChild(message);
    body.appendChild(timeDiv);
    
    const closeBtn = document.createElement('button');
    closeBtn.className = 'notification-toast-close';
    closeBtn.textContent = '×';
    closeBtn.onclick = function() {
      if (toast.parentElement) {
        toast.remove();
      }
    };
    
    content.appendChild(iconDiv);
    content.appendChild(body);
    content.appendChild(closeBtn);
    toast.appendChild(content);

    // Добавляем в контейнер
    let container = document.getElementById('notifications-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'notifications-container';
      container.className = 'notifications-container';
      document.body.appendChild(container);
    }

    container.appendChild(toast);

    // Анимация появления
    const showTimer = setTimeout(() => {
      toast.classList.add('show');
      toastTimers.delete(`show_${notification.id}`);
    }, 10);
    toastTimers.set(`show_${notification.id}`, showTimer);

    // Автоматическое удаление через 5 секунд
    const autoHideDelay = 5000;
    const hideTimer = setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.remove('show');
        const removeTimer = setTimeout(() => {
          if (toast.parentElement) {
            toast.remove();
          }
          toastTimers.delete(`remove_${notification.id}`);
        }, 300);
        toastTimers.set(`remove_${notification.id}`, removeTimer);
      }
      toastTimers.delete(`hide_${notification.id}`);
    }, autoHideDelay);
    toastTimers.set(`hide_${notification.id}`, hideTimer);

    // Клик по уведомлению (не по кнопкам) открывает страницу уведомлений
    toast.addEventListener('click', (e) => {
      // Игнорируем клики по кнопке закрытия
      if (e.target.closest('.notification-toast-close')) {
        return;
      }
      
      markAsRead(notification.id);
    });
  }

  // Получение иконки для типа уведомления
  function getNotificationIcon(type) {
    const icons = {
      friend_request: '<i class="fas fa-user-plus"></i>',
      friend_request_accepted: '<i class="fas fa-user-check"></i>',
      game_invite: '<i class="fas fa-chess"></i>',
      game_finished: '<i class="fas fa-flag-checkered"></i>',
    };
    return icons[type] || '<i class="fas fa-bell"></i>';
  }

  // Обновление счетчика непрочитанных
  async function updateUnreadCount() {
    if (!window.apiFetch) return;
    
    // Проверяем, авторизован ли пользователь
    const token = getAccessToken();
    if (!token) {
      // Для анонимных пользователей не обновляем счетчик
      return;
    }

    try {
      const res = await window.apiFetch('/api/notifications/me/unread-count');
      if (res.ok) {
        const data = await res.json();
        updateUnreadBadge(data.unread_count || 0);
      }
    } catch (e) {
      // Игнорируем ошибки для анонимных пользователей
    }
  }

  // Обновление badge с количеством непрочитанных
  function updateUnreadBadge(count) {
    // Ищем существующий badge или создаем новый
    let badge = document.getElementById('notifications-badge');
    if (!badge) {
      // Можно добавить badge в header, если есть кнопка уведомлений
      const notificationsBtn = document.querySelector('[data-notifications-btn]');
      if (notificationsBtn) {
        badge = document.createElement('span');
        badge.id = 'notifications-badge';
        badge.className = 'notifications-badge';
        notificationsBtn.appendChild(badge);
      }
    }

    if (badge) {
      if (count > 0) {
        badge.textContent = count > 99 ? '99+' : count.toString();
        badge.style.display = 'inline-block';
      } else {
        badge.style.display = 'none';
      }
    }
  }

  // Пометить уведомление как прочитанное
  async function markAsRead(notificationId) {
    if (!window.apiFetch) return;

    try {
      await window.apiFetch(`/api/notifications/${notificationId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ read: true }),
      });
      updateUnreadCount();
    } catch (e) {
      // Failed to mark as read
    }
  }

  // Экранирование HTML
  function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
  }

  // Обновление статуса подключения (для отладки)
  function updateConnectionStatus(connected) {
    // Можно добавить визуальный индикатор подключения
    window.dispatchEvent(new CustomEvent('notifications-connection-changed', { 
      detail: { connected } 
    }));
  }

  // Инициализация при загрузке страницы
  function init() {
    if (isAuthenticated()) {
      connect();
    }

    // Слушаем события авторизации/выхода
    window.addEventListener('storage', (e) => {
      if (e.key === 'access_token') {
        if (e.newValue) {
          connect();
        } else {
          disconnect();
        }
      }
    });

    // Обновляем счетчик при загрузке
    updateUnreadCount();
  }

  // Экспорт функций для использования в других скриптах
  window.NotificationsWS = {
    connect,
    disconnect,
    updateUnreadCount,
    markAsRead,
  };

  // Инициализация при загрузке DOM
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

