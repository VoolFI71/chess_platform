// Backend-driven authentication for all pages that include this file

(function () {
  // Constants for localStorage keys
  const ACCESS_KEY = 'access_token';
  const REFRESH_KEY = 'refresh_token';
  const THEME_KEY = 'theme';
  
  // Constants for API endpoints
  const API_ENDPOINTS = {
    LOGIN: '/api/auth/login',
    REGISTER: '/api/auth/register',
    REFRESH: '/api/auth/refresh',
    ME: '/api/auth/me'
  };
  
  // Constants for CSS selectors
  const SELECTORS = {
    MOBILE_MENU_BTN: '.mobile-menu-btn',
    LOGOUT_BTN: '.logout-btn',
    CABINET_BTN: '.btn-cabinet',
    USER_PILL: '.user-pill',
    HEADER_ACTIONS: '.header-actions',
    MOBILE_MENU: '.mobile-menu',
    AUTH_BUTTONS: '#authButtons',
    USER_ACTIONS: '#userActions',
    MOBILE_USER_ACTIONS: '#mobileUserActions',
    MOBILE_AUTH_BUTTONS: '#mobileAuthButtons',
    GAMES_LOGOUT_BTN: '#gamesLogoutBtn',
    GAMES_LOGOUT_BTN_MOBILE: '#gamesLogoutBtnMobile',
    BTN_LOGIN: '.btn-login',
    BTN_REGISTER: '.btn-register'
  };
  
  // Constants for breakpoints
  const DESKTOP_BREAKPOINT = 1024;

  function getAccessToken() {
    return localStorage.getItem(ACCESS_KEY) || '';
  }

  function getRefreshToken() {
    return localStorage.getItem(REFRESH_KEY) || '';
  }

  function setTokens(access, refresh) {
    if (access) localStorage.setItem(ACCESS_KEY, access);
    if (refresh) localStorage.setItem(REFRESH_KEY, refresh);
  }

  function clearTokens() {
    localStorage.removeItem(ACCESS_KEY);
    localStorage.removeItem(REFRESH_KEY);
  }

  // Create headers with authorization token
  function createHeaders(options = {}) {
    const headers = new Headers(options.headers || {});
    if (!headers.has('Content-Type') && options.body) {
      headers.set('Content-Type', 'application/json');
    }
    const token = getAccessToken();
    if (token) {
      headers.set('Authorization', `Bearer ${token}`);
    }
    return headers;
  }

  async function apiFetch(path, options = {}) {
    const headers = createHeaders(options);
    // Используем относительный путь (работает через gateway на том же порту)
    const res = await fetch(path, { ...options, headers });
    if (res.status !== 401 && res.status !== 403) return res;

    // Try refresh once
    const refreshed = await tryRefresh();
    if (!refreshed) return res;

    // Create new headers with refreshed token
    const headers2 = createHeaders(options);
    return fetch(path, { ...options, headers: headers2 });
  }

  async function tryRefresh() {
    const rt = getRefreshToken();
    if (!rt) return false;
    try {
      const res = await fetch(API_ENDPOINTS.REFRESH, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: rt }),
      });
      if (res.status === 401 || res.status === 403) {
        clearTokens();
        return false;
      }
      if (!res.ok) {
        return false;
      }
      const data = await res.json();
      setTokens(data.access_token, data.refresh_token);
      return true;
    } catch (err) {
      console.warn('Token refresh failed', err);
      return false;
    }
  }

  async function login(loginValue, password) {
    const res = await fetch(API_ENDPOINTS.LOGIN, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ login: loginValue, password }),
    });
    if (!res.ok) {
      const msg = await safeError(res);
      throw new Error(msg || 'Login failed');
    }
    const data = await res.json();
    setTokens(data.access_token, data.refresh_token);
    return data;
  }

  async function register(username, email, password) {
    const res = await fetch(API_ENDPOINTS.REGISTER, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, email, password }),
    });
    if (!res.ok) {
      const msg = await safeError(res);
      throw new Error(msg || 'Registration failed');
    }
    return res.json();
  }

  async function me() {
    const res = await apiFetch(API_ENDPOINTS.ME);
    if (!res.ok) return null;
    return res.json();
  }

  async function safeError(res) {
    try {
      const d = await res.json();
      return d && (d.detail || d.message) ? (d.detail || d.message) : res.statusText;
    } catch {
      return res.statusText;
    }
  }

  // Helper function to check if container is in mobile context
  function isMobileContext(container) {
    return container.classList.contains('mobile-menu') || 
           container.closest(SELECTORS.MOBILE_MENU) ||
           container.classList.contains('mobile-user-actions');
  }

  // Helper function to position logout button after mobile-menu-btn (rightmost position)
  function positionLogoutAfterMobileMenu(btn, container) {
    if (!btn || !container) return;
    const mobileMenuBtn = container.querySelector(SELECTORS.MOBILE_MENU_BTN);
    if (!mobileMenuBtn || btn.parentNode !== container) return;
    
    // Кнопка выхода должна быть справа, после мобильного меню
    // Порядок: userActions -> theme-toggle -> authButtons -> mobile-menu-btn -> logout-btn
    
    // Проверяем, находится ли кнопка выхода уже после мобильного меню
    let currentNext = mobileMenuBtn.nextSibling;
    while (currentNext && currentNext.nodeType !== 1) {
      currentNext = currentNext.nextSibling;
    }
    
    // Если кнопка выхода не находится сразу после мобильного меню, перемещаем её туда
    if (currentNext !== btn) {
      // Если после mobile-menu-btn есть другие элементы, вставляем logout-btn после них
      if (mobileMenuBtn.nextSibling) {
        // Находим последний элемент после mobile-menu-btn
        let lastElement = mobileMenuBtn.nextSibling;
        while (lastElement && lastElement.nextSibling && lastElement.nextSibling.nodeType === 1) {
          lastElement = lastElement.nextSibling;
        }
        if (lastElement && lastElement !== btn) {
          container.insertBefore(btn, lastElement.nextSibling);
        } else {
          container.appendChild(btn);
        }
      } else {
        // Если после mobile-menu-btn ничего нет, просто добавляем в конец
        container.appendChild(btn);
      }
    }
  }

  // Get cached games logout buttons (to avoid repeated DOM queries)
  function getGamesLogoutButtons() {
    return {
      desktop: document.querySelector(SELECTORS.GAMES_LOGOUT_BTN),
      mobile: document.querySelector(SELECTORS.GAMES_LOGOUT_BTN_MOBILE)
    };
  }

  function ensureLogoutButton(container, existingGamesLogoutBtn = null, existingGamesLogoutBtnMobile = null) {
    if (!container) return null;
    
    // Use provided buttons or fetch them if not provided
    const gamesBtns = existingGamesLogoutBtn !== null && existingGamesLogoutBtnMobile !== null
      ? { desktop: existingGamesLogoutBtn, mobile: existingGamesLogoutBtnMobile }
      : getGamesLogoutButtons();
    
    const isMobile = isMobileContext(container);
    
    // If gamesLogoutBtn exists and we're not in a mobile context, don't create a new one
    if (gamesBtns.desktop && !isMobile) {
      return null; // Don't create a duplicate for desktop
    }
    
    // If gamesLogoutBtnMobile exists and we're in a mobile context, don't create a new one
    if (gamesBtns.mobile && isMobile) {
      return null; // Don't create a duplicate for mobile
    }
    
    // Не создаем кнопку выхода в header-actions напрямую
    // Кнопка должна создаваться только в userActions или mobileUserActions
    const isHeaderActions = container.classList.contains('header-actions') || container.closest('.header-actions') === container;
    if (isHeaderActions && !isMobile && !container.closest(SELECTORS.USER_ACTIONS)) {
      return null; // Не создаем кнопку в header-actions напрямую
    }
    
    // Check if there's already a logout button in the container
    let btn = container.querySelector(SELECTORS.LOGOUT_BTN);
    
    if (!btn) {
      btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'btn btn-outline logout-btn';
      btn.innerHTML = '<i class="fas fa-sign-out-alt"></i> Выйти';
      btn.style.display = 'none';
      
      if (isMobile) {
        container.appendChild(btn);
      } else {
        // For header-actions, insert after mobile-menu-btn (rightmost position)
        // First append to container, then position it
        container.appendChild(btn);
        positionLogoutAfterMobileMenu(btn, container);
      }
    } else if (!isMobile) {
      // If button already exists and not in mobile context, ensure it's in the right position
      positionLogoutAfterMobileMenu(btn, container);
    }
    
    return btn;
  }

  let lastAuthState = false;
  let cachedUser = null;

  function ensureCabinetButton(container) {
    if (!container) return null;
    
    // Check if it's mobile menu - use existing .mobile-cabinet-link if present
    const isMobileMenu = container.classList.contains('mobile-menu') || container.closest('.mobile-menu');
    if (isMobileMenu) {
      // В мобильном меню используем существующий .mobile-cabinet-link из HTML
      // Ищем глубоко, включая внутри #mobileUserActions (даже если display: none)
      const existingMobileLink = container.querySelector('.mobile-cabinet-link') || 
                                 document.querySelector('.mobile-menu .mobile-cabinet-link');
      if (existingMobileLink) {
        // Добавляем класс btn-cabinet для совместимости, но используем существующий элемент
        if (!existingMobileLink.classList.contains('btn-cabinet')) {
          existingMobileLink.classList.add('btn-cabinet');
        }
        return existingMobileLink;
      }
    }
    
    // Для header-actions или если .mobile-cabinet-link не найден, используем стандартную логику
    let btn = container.querySelector(SELECTORS.CABINET_BTN);
    if (!btn) {
      btn = document.createElement('a');
      // href будет обновлен в updateAuthUI когда будет известен username
      btn.href = '/profile';
      btn.className = 'btn-register btn-cabinet';
      btn.innerHTML = '<i class="fas fa-user-circle"></i> Мой профиль';
      btn.style.display = 'none';
      
      // For header-actions, insert before mobile-menu-btn (but after theme-toggle)
      const mobileMenuBtn = container.querySelector(SELECTORS.MOBILE_MENU_BTN);
      if (mobileMenuBtn) {
        container.insertBefore(btn, mobileMenuBtn);
      } else {
        container.appendChild(btn);
      }
    }
    return btn;
  }

  // Remove duplicate logout buttons
  function removeDuplicateLogoutButtons(existingGamesLogoutBtn, existingGamesLogoutBtnMobile) {
    if (existingGamesLogoutBtn) {
      document.querySelectorAll(`${SELECTORS.HEADER_ACTIONS} ${SELECTORS.LOGOUT_BTN}`).forEach((btn) => {
        if (btn && btn.id !== 'gamesLogoutBtn' && btn.id !== 'gamesLogoutBtnMobile') {
          btn.remove();
        }
      });
    }
    
    if (existingGamesLogoutBtnMobile) {
      document.querySelectorAll(`${SELECTORS.MOBILE_MENU} ${SELECTORS.LOGOUT_BTN}, ${SELECTORS.MOBILE_USER_ACTIONS} ${SELECTORS.LOGOUT_BTN}`).forEach((btn) => {
        if (btn && btn.id !== 'gamesLogoutBtn' && btn.id !== 'gamesLogoutBtnMobile') {
          btn.remove();
        }
      });
    }
  }

  // Update standard header buttons (.btn-login, .btn-register)
  function updateStandardButtons(isLoggedIn) {
    document.querySelectorAll(`${SELECTORS.BTN_LOGIN}, ${SELECTORS.BTN_REGISTER}`).forEach((btn) => {
      if (!btn || !btn.classList) return;
      if (btn.classList.contains('btn-cabinet')) return;
      const isInSpecialContainer = btn.closest(SELECTORS.AUTH_BUTTONS) || btn.closest(SELECTORS.MOBILE_AUTH_BUTTONS);
      if (!isInSpecialContainer) {
        btn.style.display = isLoggedIn ? 'none' : '';
      }
    });
  }

  // Update cabinet buttons in header-actions
  function updateHeaderCabinetButtons(isLoggedIn, user) {
    document.querySelectorAll(SELECTORS.HEADER_ACTIONS).forEach((container) => {
      if (!container) return;
      
      const mobileMenuBtn = container.querySelector(SELECTORS.MOBILE_MENU_BTN);
      const cabinetBtn = ensureCabinetButton(container);
      
      if (cabinetBtn) {
        // Обновляем href с username если пользователь авторизован
        if (isLoggedIn && user && user.username) {
          cabinetBtn.href = `/profile/${encodeURIComponent(user.username)}`;
        } else {
          cabinetBtn.href = '/profile';
        }
        // На мобильных устройствах кнопка профиля не должна отображаться в хедере
        const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
        cabinetBtn.style.display = (isLoggedIn && isDesktop) ? 'inline-flex' : 'none';
        if (mobileMenuBtn && cabinetBtn.parentNode === container && cabinetBtn !== mobileMenuBtn.previousSibling) {
          container.insertBefore(cabinetBtn, mobileMenuBtn);
        }
      }
    });
  }

  // Update logout buttons in header-actions
  function updateHeaderLogoutButtons(isLoggedIn, existingGamesLogoutBtn, existingGamesLogoutBtnMobile) {
    const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
    
    document.querySelectorAll(SELECTORS.HEADER_ACTIONS).forEach((container) => {
      if (!container) return;
      
      if (existingGamesLogoutBtn) {
        // На мобильных устройствах кнопка выхода не должна отображаться в хедере
        existingGamesLogoutBtn.style.display = (isLoggedIn && isDesktop) ? 'inline-flex' : 'none';
        positionLogoutAfterMobileMenu(existingGamesLogoutBtn, container);
      } else {
        // Удаляем все кнопки выхода из header-actions, которые не находятся в userActions или mobileUserActions
        container.querySelectorAll(SELECTORS.LOGOUT_BTN).forEach((btn) => {
          if (btn) {
            const isInUserActions = btn.closest(SELECTORS.USER_ACTIONS);
            const isInMobileUserActions = btn.closest(SELECTORS.MOBILE_USER_ACTIONS);
            if (!isInUserActions && !isInMobileUserActions) {
              btn.remove();
            }
          }
        });
      }
    });
  }

  // Update cabinet buttons in mobile menu
  function updateMobileCabinetButtons(isLoggedIn, user) {
    document.querySelectorAll(SELECTORS.MOBILE_MENU).forEach((container) => {
      if (!container) return;
      
      // Сначала ищем существующий .mobile-cabinet-link из HTML
      const existingMobileLink = container.querySelector('.mobile-cabinet-link') || 
                                 document.querySelector('.mobile-menu .mobile-cabinet-link');
      
      if (existingMobileLink) {
        // Используем существующий элемент из HTML
        if (isLoggedIn && user && user.username) {
          existingMobileLink.href = `/profile/${encodeURIComponent(user.username)}`;
        } else {
          existingMobileLink.href = '/profile';
        }
        existingMobileLink.style.display = isLoggedIn ? 'flex' : 'none';
        
        // Добавляем класс btn-cabinet для совместимости стилей
        if (!existingMobileLink.classList.contains('btn-cabinet')) {
          existingMobileLink.classList.add('btn-cabinet');
        }
        
        // Удаляем любые дубликаты .btn-cabinet, которые могли быть созданы ранее
        const mobileMenuDiv = container.querySelector('div');
        if (mobileMenuDiv) {
          mobileMenuDiv.querySelectorAll('.btn-cabinet').forEach((btn) => {
            // Удаляем только те, которые НЕ являются существующим .mobile-cabinet-link
            if (btn !== existingMobileLink && !btn.classList.contains('mobile-cabinet-link')) {
              btn.remove();
            }
          });
        }
      } else {
        // Если .mobile-cabinet-link не найден, используем стандартную логику
        const cabinetBtn = ensureCabinetButton(container);
        if (cabinetBtn) {
          if (isLoggedIn && user && user.username) {
            cabinetBtn.href = `/profile/${encodeURIComponent(user.username)}`;
          } else {
            cabinetBtn.href = '/profile';
          }
          cabinetBtn.style.display = isLoggedIn ? 'block' : 'none';
        }
      }
    });
  }

  // Update logout buttons in mobile menu
  function updateMobileLogoutButtons(isLoggedIn, existingGamesLogoutBtn, existingGamesLogoutBtnMobile) {
    document.querySelectorAll(SELECTORS.MOBILE_MENU).forEach((container) => {
      if (!container) return;
      
      const mobileMenuDiv = container.querySelector('div') || container;
      if (!mobileMenuDiv) return;
      
      const cabinetBtnInMenu = mobileMenuDiv.querySelector(SELECTORS.CABINET_BTN);
      
      if (!existingGamesLogoutBtnMobile) {
        const mobileLogoutBtn = ensureLogoutButton(mobileMenuDiv, existingGamesLogoutBtn, existingGamesLogoutBtnMobile);
        if (mobileLogoutBtn) {
          mobileLogoutBtn.style.display = isLoggedIn ? 'block' : 'none';
          if (cabinetBtnInMenu && cabinetBtnInMenu.parentNode && cabinetBtnInMenu.nextSibling !== mobileLogoutBtn) {
            cabinetBtnInMenu.parentNode.insertBefore(mobileLogoutBtn, cabinetBtnInMenu.nextSibling);
          }
        }
      } else {
        existingGamesLogoutBtnMobile.style.display = isLoggedIn ? 'block' : 'none';
      }
    });
  }

  // Update auth containers
  function updateAuthContainers(isLoggedIn, isDesktop, existingGamesLogoutBtn, existingGamesLogoutBtnMobile) {
    const authButtons = document.querySelector(SELECTORS.AUTH_BUTTONS);
    if (authButtons) {
      authButtons.style.display = isDesktop ? (isLoggedIn ? 'none' : 'flex') : 'none';
    }

    const userActions = document.querySelector(SELECTORS.USER_ACTIONS);
    if (userActions) {
      // Не создаем кнопку выхода в userActions, так как она будет создана в mobileUserActions
      // или уже существует в header-actions
      userActions.style.display = isLoggedIn && isDesktop ? 'flex' : 'none';
    }

    const mobileUserActions = document.querySelector(SELECTORS.MOBILE_USER_ACTIONS);
    if (mobileUserActions) {
      if (!existingGamesLogoutBtnMobile && isLoggedIn) {
        ensureLogoutButton(mobileUserActions, existingGamesLogoutBtn, existingGamesLogoutBtnMobile);
      }
      mobileUserActions.style.display = isLoggedIn ? 'block' : 'none';
    }

    const mobileAuthButtons = document.querySelector(SELECTORS.MOBILE_AUTH_BUTTONS);
    if (mobileAuthButtons) {
      mobileAuthButtons.style.display = !isDesktop && !isLoggedIn ? 'flex' : 'none';
    }
  }

  // Update user pills - always hide username display
  function updateUserPills(user, isLoggedIn) {
    // Hide user info pills (username) on all pages
    const userInfoElements = [
      document.getElementById('gamesUserInfo'),
      document.getElementById('gamesUserInfoMobile'),
      ...document.querySelectorAll(SELECTORS.USER_PILL)
    ];
    userInfoElements.forEach((pill) => {
      if (pill) {
        pill.style.display = 'none';
      }
    });
  }

  // Update logout buttons display (only for buttons not already processed)
  function updateLogoutButtonsDisplay(isLoggedIn, existingGamesLogoutBtn, existingGamesLogoutBtnMobile) {
    document.querySelectorAll(SELECTORS.LOGOUT_BTN).forEach((el) => {
      if (!el) return;
      
      // Skip buttons that were already processed in updateHeaderActions and updateMobileMenu
      if (el === existingGamesLogoutBtn || el === existingGamesLogoutBtnMobile) {
        return;
      }
      
      // Skip buttons in header-actions and mobile-menu that were already processed
      const isInHeaderActions = el.closest(SELECTORS.HEADER_ACTIONS);
      const isInMobileMenu = el.closest(SELECTORS.MOBILE_MENU);
      if ((isInHeaderActions && existingGamesLogoutBtn) || (isInMobileMenu && existingGamesLogoutBtnMobile)) {
        return;
      }
      
      // Update display for remaining buttons
      el.style.display = isLoggedIn ? '' : 'none';
    });
  }

  function updateAuthUI(user) {
    const isLoggedIn = !!user;
    cachedUser = user || null;
    lastAuthState = isLoggedIn;
    const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
    
    // Cache DOM queries to avoid multiple lookups
    const existingGamesLogoutBtn = document.querySelector(SELECTORS.GAMES_LOGOUT_BTN);
    const existingGamesLogoutBtnMobile = document.querySelector(SELECTORS.GAMES_LOGOUT_BTN_MOBILE);
    
    // Remove duplicate logout buttons
    removeDuplicateLogoutButtons(existingGamesLogoutBtn, existingGamesLogoutBtnMobile);
    
    // Update UI components
    updateStandardButtons(isLoggedIn);
    updateHeaderCabinetButtons(isLoggedIn, user);
    updateHeaderLogoutButtons(isLoggedIn, existingGamesLogoutBtn, existingGamesLogoutBtnMobile);
    updateMobileCabinetButtons(isLoggedIn, user);
    updateMobileLogoutButtons(isLoggedIn, existingGamesLogoutBtn, existingGamesLogoutBtnMobile);
    updateAuthContainers(isLoggedIn, isDesktop, existingGamesLogoutBtn, existingGamesLogoutBtnMobile);
    updateUserPills(user, isLoggedIn);
    updateLogoutButtonsDisplay(isLoggedIn, existingGamesLogoutBtn, existingGamesLogoutBtnMobile);
    
    bindLogoutButtons();
    ensureLogoutButtonsPosition();
  }

  async function initAuth() {
    try {
      let user = null;
      if (getAccessToken() || getRefreshToken()) {
        user = await me();
        if (!user && !(await tryRefresh())) {
          // keep tokens if refresh failed due to transient issues
          if (!getRefreshToken()) clearTokens();
        } else if (!user && (getAccessToken() || getRefreshToken())) {
          user = await me();
        }
      }
      lastAuthState = !!user;
      updateAuthUI(user);
    } catch (error) {
      console.error('Failed to initialize auth:', error);
      lastAuthState = false;
      updateAuthUI(null);
    }
  }

  // Expose fetch and helpers globally for page scripts
  window.apiFetch = apiFetch;
  window.authMe = me;
  if (typeof window.getAccessToken !== 'function') {
    window.getAccessToken = getAccessToken;
  }
  if (typeof window.getRefreshToken !== 'function') {
    window.getRefreshToken = getRefreshToken;
  }
  if (typeof window.setTokens !== 'function') {
    window.setTokens = setTokens;
  }
  if (typeof window.clearTokens !== 'function') {
    window.clearTokens = clearTokens;
  }

  // Global theme initializer used by multiple pages
  // Использует единый ключ 'theme' для сохранения выбранной темы
  window.loadTheme = function loadTheme() {
    try {
      const saved = localStorage.getItem(THEME_KEY);
      const isDark = saved === 'dark';
      document.body.classList.toggle('dark', isDark);
      document.documentElement.classList.toggle('dark', isDark);
      const icon = document.getElementById('themeIcon');
      if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    } catch {
      // no-op
    }
  };

  // Global theme toggle for all pages
  // Сохраняет выбранную тему в localStorage с ключом 'theme'
  window.toggleTheme = function toggleTheme() {
    try {
      const isDark = document.body.classList.toggle('dark');
      document.documentElement.classList.toggle('dark', isDark);
      localStorage.setItem(THEME_KEY, isDark ? 'dark' : 'light');
      const icon = document.getElementById('themeIcon');
      if (icon) icon.className = isDark ? 'fas fa-moon' : 'fas fa-sun';
    } catch {
      // no-op
    }
  };

  // Helper function to find form by modal ID or action attribute
  function findForm(event, modalId, action) {
    if (event?.target && event.target.tagName === 'FORM') {
      return event.target;
    }
    const modalForm = document.querySelector(`#${modalId} form`);
    if (modalForm) return modalForm;
    return document.querySelector(`form[action="#${action}"]`);
  }

  // Override handlers expected in pages
  window.handleLogin = async function (event) {
    if (event && event.preventDefault) event.preventDefault();
    try {
      const form = findForm(event, 'loginModal', 'login');
      const inputs = form ? form.querySelectorAll('input') : [];
      const email = inputs[0]?.value?.trim() || '';
      const password = inputs[1]?.value || '';
      await login(email, password);
      const user = await me();
      updateAuthUI(user);
      // Close modals if present
      if (typeof window.closeLoginModal === 'function') window.closeLoginModal();
      if (typeof window.closeModal === 'function') window.closeModal('loginModal');
    } catch (e) {
      alert(e.message || 'Не удалось войти');
    }
  };

  window.handleRegister = async function (event) {
    if (event && event.preventDefault) event.preventDefault();
    try {
      const form = findForm(event, 'registerModal', 'register');
      const formData = form ? new FormData(form) : null;
      const username = (formData?.get('username') || '').toString().trim();
      const email = (formData?.get('email') || '').toString().trim();
      const password = (formData?.get('password') || '').toString();
      if (!username) throw new Error('Укажите имя пользователя');
      if (!email) throw new Error('Укажите email');
      if (!password) throw new Error('Укажите пароль');
      await register(username, email, password);
      await login(email, password);
      const user = await me();
      updateAuthUI(user);
      if (typeof window.closeRegisterModal === 'function') window.closeRegisterModal();
      if (typeof window.closeModal === 'function') window.closeModal('registerModal');
    } catch (e) {
      alert(e.message || 'Не удалось зарегистрироваться');
    }
  };

  window.handleLogout = async function () {
    clearTokens();
    cachedUser = null;
    updateAuthUI(null);
    window.location.reload();
  };

  // Wire logout buttons
  function bindLogoutButtons() {
    document.querySelectorAll(SELECTORS.LOGOUT_BTN).forEach((btn) => {
      if (!btn) return;
      if (btn.dataset.bound === 'true') return;
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        window.handleLogout();
      });
      btn.dataset.bound = 'true';
    });
  }

  // Function to ensure all logout buttons are positioned correctly
  function ensureLogoutButtonsPosition() {
    // Cache mobile-menu-btn queries to avoid repeated lookups
    document.querySelectorAll(SELECTORS.HEADER_ACTIONS).forEach((container) => {
      if (!container) return;
      if (isMobileContext(container)) return;
      
      const mobileMenuBtn = container.querySelector(SELECTORS.MOBILE_MENU_BTN);
      if (!mobileMenuBtn) return;
      
      // Only process logout buttons that are direct children of container
      const logoutBtns = Array.from(container.children).filter(
        (child) => child && child.classList && child.classList.contains('logout-btn')
      );
      
      logoutBtns.forEach((btn) => {
        if (btn) {
          positionLogoutAfterMobileMenu(btn, container);
        }
      });
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    initAuth();
    bindLogoutButtons();
    ensureLogoutButtonsPosition();
  });

  window.addEventListener('resize', () => {
    updateAuthUI(cachedUser);
    // Также обновляем видимость элементов при изменении размера окна
    if (cachedUser) {
      const isLoggedIn = !!cachedUser;
      const isDesktop = window.innerWidth >= DESKTOP_BREAKPOINT;
      
      // Обновляем кнопки выхода
      document.querySelectorAll(SELECTORS.HEADER_ACTIONS + ' ' + SELECTORS.LOGOUT_BTN).forEach((btn) => {
        if (btn && !btn.closest(SELECTORS.MOBILE_MENU) && !btn.closest(SELECTORS.MOBILE_USER_ACTIONS)) {
          btn.style.display = (isLoggedIn && isDesktop) ? 'inline-flex' : 'none';
        }
      });
      
      // Обновляем кнопки профиля
      document.querySelectorAll(SELECTORS.HEADER_ACTIONS + ' ' + SELECTORS.CABINET_BTN).forEach((btn) => {
        if (btn && !btn.closest(SELECTORS.MOBILE_MENU)) {
          btn.style.display = (isLoggedIn && isDesktop) ? 'inline-flex' : 'none';
        }
      });
      
      // Обновляем userActions
      const userActions = document.querySelector(SELECTORS.USER_ACTIONS);
      if (userActions && !userActions.closest(SELECTORS.MOBILE_MENU)) {
        userActions.style.display = (isLoggedIn && isDesktop) ? 'flex' : 'none';
      }
    }
  });
})();


