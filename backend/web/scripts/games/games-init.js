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
        console.error('GamesState not loaded after max retries');
      }
      return;
    }
    
    if (typeof window.bindTabs !== 'function') {
      retryCount++;
      if (retryCount < MAX_RETRIES) {
        setTimeout(initialize, 50);
      } else {
        console.error('bindTabs not available after max retries');
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
        console.error('Column titles not found after max retries');
      }
      return;
    }
    
    // All dependencies ready, initialize tabs
    console.log('Initializing games tabs...');
    window.bindTabs();
  }
  
  // Try to initialize when DOM is ready
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize);
  } else {
    // DOM already loaded, initialize immediately
    initialize();
  }
})();
