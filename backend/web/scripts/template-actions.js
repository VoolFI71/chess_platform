(() => {
  'use strict';

  const requiredFunction = (name) => {
    const fn = window[name];
    if (typeof fn !== 'function') {
      throw new Error(`${name} is not initialized`);
    }
    return fn;
  };

  const clickActions = {
    navigate: (element) => {
      window.location.href = element.dataset.route;
    },
    'navigate-close-menu': (element) => {
      requiredFunction('closeMobileMenu')();
      window.location.href = element.dataset.route;
    },
    'toggle-theme': () => requiredFunction('toggleTheme')(),
    'toggle-mobile-menu': () => requiredFunction('toggleMobileMenu')(),
    'close-mobile-menu': () => requiredFunction('closeMobileMenu')(),
    'toggle-parent': (element) => element.parentElement.classList.toggle(element.dataset.toggleClass),
    'open-booking': (element) => requiredFunction('openBookingModal')(element.dataset.coach),
    'close-login-modal': () => requiredFunction('closeLoginModal')(),
    'close-register-modal': () => requiredFunction('closeRegisterModal')(),
    'open-register-modal': () => {
      requiredFunction('closeLoginModal')();
      requiredFunction('showRegisterModal')();
    },
    'open-login-modal': () => {
      requiredFunction('closeRegisterModal')();
      requiredFunction('showLoginModal')();
    },
    'close-purchase-modal': () => requiredFunction('closePurchaseModal')(),
    'complete-purchase': () => requiredFunction('completePurchase')(),
  };

  const submitActions = {
    login: 'handleLogin',
    register: 'handleRegister',
    booking: 'handleBookingSubmit',
  };

  document.addEventListener('click', (event) => {
    const element = event.target.closest('[data-action]');
    if (!element) return;

    const action = clickActions[element.dataset.action];
    if (!action) {
      throw new Error(`Unknown template action: ${element.dataset.action}`);
    }
    event.preventDefault();
    action(element);
  });

  document.addEventListener('submit', (event) => {
    const form = event.target.closest('form[data-submit-action]');
    if (!form) return;

    const handlerName = submitActions[form.dataset.submitAction];
    if (!handlerName) {
      throw new Error(`Unknown form action: ${form.dataset.submitAction}`);
    }
    requiredFunction(handlerName)(event);
  });
})();
