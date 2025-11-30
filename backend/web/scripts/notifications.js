// Real-time notifications via WebSocket
(function () {
  'use strict';

  let ws = null;
  let reconnectTimer = null;
  let reconnectAttempts = 0;
  const MAX_RECONNECT_ATTEMPTS = 5;
  const RECONNECT_DELAY = 3000; // 3 seconds

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

    if (ws && ws.readyState === WebSocket.OPEN) {
      return; // Уже подключен
    }

    const token = getAccessToken();
    if (!token) {
      return;
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const url = `${protocol}//${window.location.host}/ws/notifications?token=${encodeURIComponent(token)}`;

    try {
      ws = new WebSocket(url);

      ws.onopen = () => {
        console.log('[Notifications] WebSocket connected');
        reconnectAttempts = 0;
        updateConnectionStatus(true);
      };

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'notification') {
            handleNotification(data);
          } else if (data === 'pong') {
            // Ответ на ping
          }
        } catch (e) {
          console.error('[Notifications] Failed to parse message:', e);
        }
      };

      ws.onerror = (error) => {
        console.error('[Notifications] WebSocket error:', error);
        updateConnectionStatus(false);
      };

      ws.onclose = (event) => {
        console.log('[Notifications] WebSocket closed:', event.code, event.reason);
        updateConnectionStatus(false);
        ws = null;

        // Пытаемся переподключиться, если не было явного закрытия
        if (event.code !== 1000 && isAuthenticated()) {
          scheduleReconnect();
        }
      };
    } catch (e) {
      console.error('[Notifications] Failed to create WebSocket:', e);
      scheduleReconnect();
    }
  }

  // Планирование переподключения
  function scheduleReconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
    }

    if (reconnectAttempts >= MAX_RECONNECT_ATTEMPTS) {
      console.warn('[Notifications] Max reconnect attempts reached');
      return;
    }

    reconnectAttempts++;
    const delay = RECONNECT_DELAY * reconnectAttempts;
    console.log(`[Notifications] Reconnecting in ${delay}ms (attempt ${reconnectAttempts}/${MAX_RECONNECT_ATTEMPTS})`);

    reconnectTimer = setTimeout(() => {
      connect();
    }, delay);
  }

  // Отключение от WebSocket
  function disconnect() {
    if (reconnectTimer) {
      clearTimeout(reconnectTimer);
      reconnectTimer = null;
    }

    if (ws) {
      ws.close(1000, 'Client disconnect');
      ws = null;
    }

    reconnectAttempts = 0;
    updateConnectionStatus(false);
  }

  // Обработка входящего уведомления
  function handleNotification(data) {
    console.log('[Notifications] Received notification:', data);

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

    // Для заявок в друзья добавляем кнопки действий
    const isFriendRequest = notification.notification_type === 'friend_request';
    const friendshipId = notification.data?.friendship_id;
    
    let actionsHTML = '';
    if (isFriendRequest && friendshipId) {
      actionsHTML = `
        <div class="notification-toast-actions">
          <button class="notification-toast-action-btn accept-btn" data-action="accept" data-friendship-id="${friendshipId}">
            <i class="fas fa-check"></i> Принять
          </button>
          <button class="notification-toast-action-btn decline-btn" data-action="decline" data-friendship-id="${friendshipId}">
            <i class="fas fa-times"></i> Отклонить
          </button>
        </div>
      `;
    }

    toast.innerHTML = `
      <div class="notification-toast-content">
        <div class="notification-toast-icon">${icon}</div>
        <div class="notification-toast-body">
          <div class="notification-toast-title">${escapeHtml(notification.title)}</div>
          <div class="notification-toast-message">${escapeHtml(notification.message)}</div>
          <div class="notification-toast-time">${time}</div>
          ${actionsHTML}
        </div>
        <button class="notification-toast-close" onclick="this.parentElement.parentElement.remove()">×</button>
      </div>
    `;

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
    setTimeout(() => {
      toast.classList.add('show');
    }, 10);

    // Обработчики для кнопок действий (для заявок в друзья)
    if (isFriendRequest && friendshipId) {
      const acceptBtn = toast.querySelector('[data-action="accept"]');
      const declineBtn = toast.querySelector('[data-action="decline"]');
      
      if (acceptBtn) {
        acceptBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleFriendRequestAction(toast, friendshipId, 'accepted', acceptBtn);
        });
      }
      
      if (declineBtn) {
        declineBtn.addEventListener('click', async (e) => {
          e.stopPropagation();
          await handleFriendRequestAction(toast, friendshipId, 'declined', declineBtn);
        });
      }
    }

    // Автоматическое удаление через 10 секунд (увеличено для заявок с кнопками)
    const autoHideDelay = isFriendRequest ? 10000 : 5000;
    setTimeout(() => {
      if (toast.parentElement) {
        toast.classList.remove('show');
        setTimeout(() => {
          if (toast.parentElement) {
            toast.remove();
          }
        }, 300);
      }
    }, autoHideDelay);

    // Клик по уведомлению (не по кнопкам) открывает страницу уведомлений
    toast.addEventListener('click', (e) => {
      // Игнорируем клики по кнопкам и кнопке закрытия
      if (e.target.closest('.notification-toast-close') || 
          e.target.closest('.notification-toast-actions')) {
        return;
      }
      
      markAsRead(notification.id);
      
      // Для заявок в друзья - переходим на страницу заявок
      if (isFriendRequest) {
        const currentPath = window.location.pathname;
        if (currentPath.startsWith('/profile/')) {
          // Если уже на странице профиля, переключаемся на вкладку заявок
          const friendRequestsSection = document.getElementById('friendRequests');
          const friendRequestsSidebarItem = document.querySelector('[data-section="friendRequests"]');
          if (friendRequestsSection && friendRequestsSidebarItem) {
            // Убираем активность со всех элементов
            document.querySelectorAll('.sidebar-item').forEach(item => item.classList.remove('active'));
            document.querySelectorAll('.content-section').forEach(section => section.classList.remove('active'));
            
            // Активируем вкладку заявок
            friendRequestsSidebarItem.classList.add('active');
            friendRequestsSection.classList.add('active');
            
            // Загружаем заявки, если функция доступна
            if (typeof window.loadFriendRequests === 'function') {
              window.loadFriendRequests();
            }
          }
        } else {
          // Переходим на страницу профиля с вкладкой заявок
          window.location.href = '/profile/me#friendRequests';
        }
      }
    });
  }

  // Обработка действий с заявкой в друзья
  async function handleFriendRequestAction(toast, friendshipId, action, button) {
    if (!window.apiFetch) {
      console.error('[Notifications] apiFetch не доступен');
      return;
    }

    // Блокируем кнопки
    const actionsContainer = toast.querySelector('.notification-toast-actions');
    if (actionsContainer) {
      actionsContainer.querySelectorAll('button').forEach(btn => {
        btn.disabled = true;
      });
    }
    button.innerHTML = '<i class="fas fa-spinner fa-spin"></i>';

    try {
      const res = await window.apiFetch(`/api/friendships/${friendshipId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: action }),
      });

      if (res.ok) {
        // Помечаем уведомление как прочитанное
        const notificationId = toast.getAttribute('data-notification-id');
        if (notificationId) {
          markAsRead(parseInt(notificationId));
        }

        // Обновляем содержимое уведомления
        const messageEl = toast.querySelector('.notification-toast-message');
        if (messageEl) {
          messageEl.textContent = action === 'accepted' 
            ? 'Заявка принята!' 
            : 'Заявка отклонена';
          messageEl.style.color = action === 'accepted' ? 'var(--success)' : 'var(--muted-foreground)';
        }

        // Удаляем кнопки действий
        if (actionsContainer) {
          actionsContainer.remove();
        }

        // Обновляем списки, если функции доступны
        if (action === 'accepted') {
          if (typeof window.loadFriendRequests === 'function') {
            window.loadFriendRequests();
          }
          if (typeof window.loadFriendsList === 'function') {
            window.loadFriendsList();
          }
        } else {
          if (typeof window.loadFriendRequests === 'function') {
            window.loadFriendRequests();
          }
        }

        // Удаляем уведомление через 2 секунды
        setTimeout(() => {
          toast.classList.remove('show');
          setTimeout(() => {
            if (toast.parentElement) {
              toast.remove();
            }
          }, 300);
        }, 2000);
      } else {
        throw new Error('Failed to process friend request');
      }
    } catch (e) {
      console.error('[Notifications] Failed to process friend request:', e);
      
      // Восстанавливаем кнопки
      if (actionsContainer) {
        actionsContainer.querySelectorAll('button').forEach(btn => {
          btn.disabled = false;
        });
      }
      button.innerHTML = action === 'accepted' 
        ? '<i class="fas fa-check"></i> Принять'
        : '<i class="fas fa-times"></i> Отклонить';
      
      alert('Не удалось обработать заявку. Попробуйте еще раз.');
    }
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

    try {
      const res = await window.apiFetch('/api/notifications/me/unread-count');
      if (res.ok) {
        const data = await res.json();
        updateUnreadBadge(data.unread_count || 0);
      }
    } catch (e) {
      console.error('[Notifications] Failed to update unread count:', e);
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
      console.error('[Notifications] Failed to mark as read:', e);
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

