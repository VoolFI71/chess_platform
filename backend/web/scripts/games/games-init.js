// Games Init - Initialization and setup
(() => {
  let retryCount = 0;
  const MAX_RETRIES = 20; // 20 * 50ms = 1 second max wait
  
  function initialize() {
    // Wait for all dependencies to be loaded
    if (typeof window.getGamesState !== 'function') {
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        setTimeout(initialize, 50);
      } else {
        }
      return;
    }
    
    if (typeof window.bindTabs !== 'function') {
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        setTimeout(initialize, 50);
      } else {
        }
      return;
    }
    
    // Check if DOM elements exist
    const columnTitles = document.querySelectorAll('.column-title[data-tab]');
    if (columnTitles.length === 0) {
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        setTimeout(initialize, 50);
      } else {
        }
      return;
    }
    
    // All dependencies ready, initialize tabs
    window.bindTabs();
    if (typeof window.bindGamesUIEvents !== 'function') {
      throw new Error('Games UI module is not initialized');
    }
    window.bindGamesUIEvents();
  }
  
  // Try to initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // DOM already loaded, initialize immediately
    initialize();
  }
})();
