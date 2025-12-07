// Утилита для управления анонимными сессиями

const SESSION_KEY = 'anonymous_session_id';

/**
 * Получить или создать session_id для анонимного игрока
 * @returns {string} UUID v4 session ID
 */
function getOrCreateSessionId() {
    let sessionId = localStorage.getItem(SESSION_KEY);
    
    if (!sessionId) {
        // Генерируем UUID v4
        sessionId = generateUUID();
        localStorage.setItem(SESSION_KEY, sessionId);
    }
    
    return sessionId;
}

/**
 * Генерировать UUID v4
 * @returns {string} UUID v4
 */
function generateUUID() {
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
        const r = Math.random() * 16 | 0;
        const v = c === 'x' ? r : (r & 0x3 | 0x8);
        return v.toString(16);
    });
}

/**
 * Получить заголовки для анонимных запросов
 * @returns {Object} Headers object with X-Session-ID
 */
function getAnonymousHeaders() {
    const sessionId = getOrCreateSessionId();
    return {
        'X-Session-ID': sessionId
    };
}

/**
 * Проверить, авторизован ли пользователь
 * @returns {boolean} true если пользователь авторизован
 */
function isAuthenticated() {
    return typeof window.apiFetch === 'function' && 
           localStorage.getItem('access_token') !== null;
}

/**
 * Получить session_id (для использования в WebSocket и других местах)
 * @returns {string|null} Session ID или null если пользователь авторизован
 */
function getSessionId() {
    if (isAuthenticated()) {
        return null; // Авторизованные пользователи не используют session_id
    }
    return getOrCreateSessionId();
}

// Экспортируем функции в глобальную область видимости
window.getOrCreateSessionId = getOrCreateSessionId;
window.getAnonymousHeaders = getAnonymousHeaders;
window.isAuthenticated = isAuthenticated;
window.getSessionId = getSessionId;

