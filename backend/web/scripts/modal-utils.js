(function () {
  let modalScrollPosition = 0;
  let lastFocusedElement = null;
  let focusTrapElements = [];

  function lockScroll() {
    modalScrollPosition = window.pageYOffset || document.documentElement.scrollTop || 0;
    document.documentElement.classList.add('modal-open');
    document.body.classList.add('modal-open');
    document.body.style.position = 'fixed';
    document.body.style.top = `-${modalScrollPosition}px`;
    document.body.style.width = '100%';
  }

  function unlockScroll() {
    document.documentElement.classList.remove('modal-open');
    document.body.classList.remove('modal-open');
    document.body.style.position = '';
    document.body.style.top = '';
    document.body.style.width = '';
    window.scrollTo(0, modalScrollPosition || 0);
  }

  function updateBodyScrollLock() {
    const hasActiveModal = document.querySelector('.modal.active') !== null;
    if (hasActiveModal) lockScroll();
    else unlockScroll();
  }

  // Accessibility: Focus trap для модалок
  function setupFocusTrap(modal) {
    const focusableElements = modal.querySelectorAll(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
    );
    focusTrapElements = Array.from(focusableElements);
    
    if (focusTrapElements.length > 0) {
      const firstElement = focusTrapElements[0];
      const lastElement = focusTrapElements[focusTrapElements.length - 1];
      
      modal.addEventListener('keydown', function trapFocus(e) {
        if (e.key !== 'Tab') return;
        
        if (e.shiftKey) {
          if (document.activeElement === firstElement) {
            lastElement.focus();
            e.preventDefault();
          }
        } else {
          if (document.activeElement === lastElement) {
            firstElement.focus();
            e.preventDefault();
          }
        }
      });
      
      // Фокус на первый элемент при открытии
      setTimeout(() => firstElement.focus(), 100);
    }
  }

  function openModal(modalId, options = {}) {
    const modal = document.getElementById(modalId);
    if (!modal) return null;
    
    // Сохраняем последний сфокусированный элемент
    lastFocusedElement = document.activeElement;
    
    modal.classList.add('active');
    modal.setAttribute('aria-hidden', 'false');
    updateBodyScrollLock();
    
    // Setup focus trap
    setupFocusTrap(modal);
    
    if (typeof options.onOpen === 'function') {
      options.onOpen(modal);
    }
    return modal;
  }

  function closeModal(modalId) {
    if (modalId) {
      const modal = document.getElementById(modalId);
      if (modal) {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
      }
    } else {
      document.querySelectorAll('.modal.active').forEach((modal) => {
        modal.classList.remove('active');
        modal.setAttribute('aria-hidden', 'true');
      });
    }
    updateBodyScrollLock();
    
    // Возвращаем фокус на элемент, который был до открытия модалки
    if (lastFocusedElement && lastFocusedElement.focus) {
      lastFocusedElement.focus();
      lastFocusedElement = null;
    }
  }

  function buildNextQuery() {
    const currentPath = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (!currentPath || currentPath === '/login' || currentPath === '/register') {
      return '';
    }
    try {
      return `?next=${encodeURIComponent(currentPath)}`;
    } catch {
      return '';
    }
  }

  function showLoginModal() {
    const loginPath = '/login';
    window.location.href = `${loginPath}${buildNextQuery()}`;
    return null;
  }

  function closeLoginModal() {
    closeModal('loginModal');
  }

  function showRegisterModal() {
    const registerPath = '/register';
    window.location.href = `${registerPath}${buildNextQuery()}`;
    return null;
  }

  function closeRegisterModal() {
    closeModal('registerModal');
  }

  document.addEventListener('click', (event) => {
    const target = event.target;
    if (target && target.classList && target.classList.contains('modal')) {
      target.classList.remove('active');
      updateBodyScrollLock();
    }
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      closeModal();
    }
  });

  window.modalUtils = {
    openModal,
    closeModal,
    updateBodyScrollLock,
  };

  window.showModal = openModal;
  window.closeModal = closeModal;
  window.showLoginModal = showLoginModal;
  window.closeLoginModal = closeLoginModal;
  window.showRegisterModal = showRegisterModal;
  window.closeRegisterModal = closeRegisterModal;
})();












