// Games Tabs - Tab management
(() => {
  const state = window.getGamesState();

  function bindTabs() {
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.addEventListener('click', () => setActiveTab(btn.dataset.tab));
    });
    
    document.querySelectorAll('.tab').forEach((tab) => {
      tab.addEventListener('click', () => setActiveTab(tab.dataset.tab));
    });
    
    document.querySelectorAll('.column-title[data-tab]').forEach((title) => {
      title.addEventListener('click', () => {
        const tabId = title.dataset.tab;
        if (tabId) {
          setActiveTab(tabId);
        }
      });
    });
  }

  function setActiveTab(tab) {
    if (!tab) {
      console.warn('setActiveTab called without tab parameter');
      return;
    }
    
    console.log('Setting active tab to:', tab);
    state.activeTab = tab;
    
    document.querySelectorAll('.tab-btn').forEach((btn) => {
      btn.classList.toggle('active', btn.dataset.tab === tab);
    });
    document.querySelectorAll('.tab-panel').forEach((panel) => {
      panel.classList.toggle('active', panel.dataset.panel === tab);
    });
    
    document.querySelectorAll('.tab').forEach((t) => {
      t.classList.toggle('active', t.dataset.tab === tab);
    });
    
    document.querySelectorAll('.tab-content').forEach((content) => {
      const targetTab = content.id?.replace('-tab', '');
      if (targetTab === tab) {
        content.classList.add('active');
        console.log('Activated tab content:', content.id);
      } else {
        content.classList.remove('active');
      }
    });
    
    document.querySelectorAll('.column-title[data-tab]').forEach((title) => {
      if (title.dataset.tab === tab) {
        title.classList.add('active');
      } else {
        title.classList.remove('active');
      }
    });
    
    if (tab === 'lobby') {
      console.log('Loading lobby games...');
      if (typeof window.loadWaitingRoomGames === 'function') {
        window.loadWaitingRoomGames();
      }
    } else if (tab === 'tv') {
      if (typeof window.loadTVGames === 'function') {
        window.loadTVGames();
      }
    }
  }

  // Export functions
  window.bindTabs = bindTabs;
  window.setActiveTab = setActiveTab;
})();
