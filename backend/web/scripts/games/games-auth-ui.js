// Games Auth UI - Authentication panel updates
(() => {
  const state = window.getGamesState();

  function updateAuthPanel() {
    const info = document.getElementById('gamesUserInfo');
    const infoMobile = document.getElementById('gamesUserInfoMobile');
    const loginBtns = [
      document.getElementById('gamesLoginBtn'),
      document.getElementById('gamesLoginBtnMobile'),
    ];
    const registerBtns = [
      document.getElementById('gamesRegisterBtn'),
      document.getElementById('gamesRegisterBtnMobile'),
    ];
    const logoutBtns = [
      document.getElementById('gamesLogoutBtn'),
      document.getElementById('gamesLogoutBtnMobile'),
    ];
    const userActions = document.getElementById('userActions');
    const authButtons = document.getElementById('authButtons');
    const mobileUser = document.getElementById('mobileUserActions');
    const mobileAuth = document.getElementById('mobileAuthButtons');

    const isDesktop = window.innerWidth >= 1024;

    if (info) info.style.display = 'none';
    if (infoMobile) infoMobile.style.display = 'none';

    if (state.currentUser) {
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      logoutBtns.forEach((btn) => {
        if (btn) {
          const isInHeaderActions = btn.closest('.header-actions') && !btn.closest('.mobile-menu');
          if (isInHeaderActions && !isDesktop) {
            btn.style.display = 'none';
          } else if (isInHeaderActions && isDesktop) {
            btn.style.display = 'inline-flex';
          } else if (!isInHeaderActions) {
            btn.style.display = 'inline-flex';
          }
        }
      });
      if (userActions) userActions.style.display = isDesktop ? 'flex' : 'none';
      if (authButtons) authButtons.style.display = 'none';
      if (mobileUser) mobileUser.style.display = 'flex';
      if (mobileAuth) mobileAuth.style.display = 'none';
    } else {
      loginBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      registerBtns.forEach((btn) => { if (btn) btn.style.display = 'inline-flex'; });
      logoutBtns.forEach((btn) => { if (btn) btn.style.display = 'none'; });
      if (userActions) userActions.style.display = 'none';
      if (authButtons) authButtons.style.display = isDesktop ? 'flex' : 'none';
      if (mobileUser) mobileUser.style.display = 'none';
      if (mobileAuth) mobileAuth.style.display = 'flex';
    }
  }

  function toggleCreateForm() {
    const hint = document.getElementById('createGameHint');
    const submit = document.getElementById('createGameBtn');
    if (!hint || !submit) return;
    if (state.currentUser) {
      hint.style.display = 'none';
      submit.disabled = false;
    } else {
      hint.style.display = 'block';
      submit.disabled = true;
    }
  }

  const handleLoginRedirect = () => {
    if (window.closeMobileMenu) window.closeMobileMenu();
    window.location.href = '/login';
  };

  const handleRegisterRedirect = () => {
    if (window.closeMobileMenu) window.closeMobileMenu();
    window.location.href = '/register';
  };

  async function handleLogout() {
    await fetch('/api/auth/logout', { method: 'POST', credentials: 'include' });
    state.currentUser = null;
    updateAuthPanel();
    toggleCreateForm();
    if (window.showToast) window.showToast('Вы вышли из аккаунта');
  }

  // Export functions
  window.updateAuthPanel = updateAuthPanel;
  window.toggleCreateForm = toggleCreateForm;
  window.handleLoginRedirect = handleLoginRedirect;
  window.handleRegisterRedirect = handleRegisterRedirect;
  window.handleLogout = handleLogout;
})();
