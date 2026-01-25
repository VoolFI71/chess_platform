// Games Forms - Forms and modal windows handling
// All core functionality has been moved to modular files in /scripts/games/

// Initialize UI elements when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
  // Проверяем авторизацию и настраиваем UI для анонимных пользователей
  const isAuth = typeof window.isAuthenticated === 'function' ? window.isAuthenticated() : (typeof window.getAccessToken === 'function' && window.getAccessToken() !== null && window.getAccessToken() !== '');
  
  // Блок выбора типа игры удален - тип игры определяется автоматически через getSelectedGameType()
  
// Game type toggle
document.querySelectorAll('.game-type-toggle').forEach(toggle => {
    const options = toggle.querySelectorAll('.type-option');
    options.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            // Не позволяем анонимным пользователям выбирать рейтинговую опцию
            if (!isAuth && option.dataset.type === 'rated') {
              if (typeof window.showToast === 'function') {
                window.showToast('Для создания рейтинговой партии необходимо войти в аккаунт', 'error');
              }
              return;
            }
            options.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
        });
    });
});

// Color selection toggle
document.querySelectorAll('#colorToggle, #friendColorToggle').forEach(toggle => {
    const colorOptions = toggle.querySelectorAll('.color-option');
    colorOptions.forEach(option => {
        option.addEventListener('click', (e) => {
            e.preventDefault();
            colorOptions.forEach(o => o.classList.remove('active'));
            option.classList.add('active');
        });
    });
});

  // Mode card click - Create game directly with selected time
document.querySelectorAll('.mode-card[data-time]').forEach(card => {
      card.addEventListener('click', async () => {
        const time = card.dataset.time;
          if (!time) return; // Skip if no time data

          // Parse time control (format: "minutes+increment" or "minutes")
          const parts = time.split('+').map(Number);
          const minutes = parts[0] || 5;
          const increment = parts[1] || 0;

          // Show loading state
          card.style.opacity = '0.6';
          card.style.pointerEvents = 'none';
        
          try {
            // Create game with selected type (rated/casual from selector)
            // Для быстрой игры всегда используем товарищескую (нерейтинговую) игру
            const game = await window.createGame({
              minutes,
              increment,
              isRated: false, // Быстрые игры всегда товарищеские
              creatorColor: 'random',
              onSuccess: (game) => {
                if (game && game.id) {
                  // Show share screen with QR code and link in customGameModal
                  const customGameModal = document.getElementById('customGameModal');
                  const customGameShareScreen = document.getElementById('customGameShareScreen');
                  const customGameForm = document.getElementById('customGameForm');
                  const customGameShareLink = document.getElementById('customGameShareLink');
                  const customGameQrImage = document.getElementById('customGameQrImage');
                  
                  // Generate share link
                  const shareLink = `${window.location.origin}/match/${game.id}`;
                  
                  // Update link input
                  if (customGameShareLink) {
                    customGameShareLink.value = shareLink;
                  }
                  
                  // Update QR code
                  if (customGameQrImage) {
                    const encoded = encodeURIComponent(shareLink);
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=svg&data=${encoded}`;
                    customGameQrImage.src = qrUrl;
                    customGameQrImage.alt = 'QR-код приглашения';
                  }
                  
                  // Hide form and show share screen
                  if (customGameForm) customGameForm.style.display = 'none';
                  if (customGameShareScreen) {
                    customGameShareScreen.style.display = 'block';
                    customGameShareScreen.classList.add('active');
                  }
                  
                  // Update modal title
                  const modalTitle = customGameModal?.querySelector('.modal-title');
                  if (modalTitle) {
                    modalTitle.innerHTML = '<i class="fas fa-user-friends"></i> Игра с другом';
                  }
                  
                  // Open modal
                  if (customGameModal) {
                    customGameModal.classList.add('active');
                  }
                  
                  // Start polling for second player
                  startWaitingForOpponent(game.id);
                }
              },
              onError: (err, message) => {
                if (window.showToast) window.showToast(message || 'Не удалось создать партию', 'error');
              }
            });
          } catch (err) {
            if (window.showToast) window.showToast('Не удалось создать партию', 'error');
          } finally {
            // Restore card state
            card.style.opacity = '1';
            card.style.pointerEvents = 'auto';
          }
    });
});

// Custom game modal
const customGameBtn = document.getElementById('customGameBtn');
const customGameModal = document.getElementById('customGameModal');
const closeModal = document.getElementById('closeModal');

if (customGameBtn && customGameModal) {
    customGameBtn.addEventListener('click', () => {
        customGameModal.classList.add('active');
    });
}

if (closeModal) {
    closeModal.addEventListener('click', () => {
        customGameModal.classList.remove('active');
        // Reset form and hide share screen
        const customGameForm = document.getElementById('customGameForm');
        const customGameShareScreen = document.getElementById('customGameShareScreen');
        const modalTitle = customGameModal?.querySelector('.modal-title');
        if (customGameForm) customGameForm.style.display = 'block';
        if (customGameShareScreen) {
            customGameShareScreen.style.display = 'none';
            customGameShareScreen.classList.remove('active');
        }
        // Reset modal title
        if (modalTitle) {
            modalTitle.innerHTML = '<i class="fas fa-cog"></i> Параметры игры';
        }
        // Stop polling when modal is closed
        if (opponentPollingInterval) {
            clearInterval(opponentPollingInterval);
            opponentPollingInterval = null;
        }
        opponentPollingStartTime = null;
    });
}

if (customGameModal) {
    customGameModal.addEventListener('click', (e) => {
        if (e.target === customGameModal) {
            customGameModal.classList.remove('active');
            // Reset form and hide share screen
            const customGameForm = document.getElementById('customGameForm');
            const customGameShareScreen = document.getElementById('customGameShareScreen');
            const modalTitle = customGameModal?.querySelector('.modal-title');
            if (customGameForm) customGameForm.style.display = 'block';
            if (customGameShareScreen) {
                customGameShareScreen.style.display = 'none';
                customGameShareScreen.classList.remove('active');
            }
            // Reset modal title
            if (modalTitle) {
                modalTitle.innerHTML = '<i class="fas fa-cog"></i> Параметры игры';
            }
            // Stop polling when modal is closed
            if (opponentPollingInterval) {
                clearInterval(opponentPollingInterval);
                opponentPollingInterval = null;
            }
            opponentPollingStartTime = null;
        }
    });
}

// Friend game modal
const friendGameModal = document.getElementById('friendGameModal');
const closeFriendModal = document.getElementById('closeFriendModal');
const friendSetupScreen = document.getElementById('friendSetupScreen');
const friendShareScreen = document.getElementById('friendShareScreen');

const updateShareQrCode = (link) => {
    const qrImage = document.getElementById('shareQrImage');
    if (!qrImage) return;

    if (!link) {
        qrImage.removeAttribute('src');
        qrImage.alt = 'QR-код приглашения';
        return;
    }

    const encoded = encodeURIComponent(link);
    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=svg&data=${encoded}`;
    if (qrImage.dataset.currentSrc !== qrUrl) {
        qrImage.src = qrUrl;
        qrImage.dataset.currentSrc = qrUrl;
    }
    qrImage.alt = 'QR-код приглашения';
};

if (closeFriendModal) {
    closeFriendModal.addEventListener('click', () => {
        friendGameModal.classList.remove('active');
        // Stop polling when modal is closed
        if (opponentPollingInterval) {
            clearInterval(opponentPollingInterval);
            opponentPollingInterval = null;
        }
        opponentPollingStartTime = null;
    });
}

if (friendGameModal) {
    friendGameModal.addEventListener('click', (e) => {
        if (e.target === friendGameModal) {
            friendGameModal.classList.remove('active');
              // Stop polling when modal is closed
              if (opponentPollingInterval) {
                  clearInterval(opponentPollingInterval);
                  opponentPollingInterval = null;
              }
              opponentPollingStartTime = null;
        }
    });
}

// Sliders - Custom game
const minutesSlider = document.getElementById('minutesSlider');
const minutesValue = document.getElementById('minutesValue');
const incrementSlider = document.getElementById('incrementSlider');
const incrementValue = document.getElementById('incrementValue');

if (minutesSlider && minutesValue) {
    minutesSlider.addEventListener('input', () => {
        minutesValue.textContent = minutesSlider.value;
    });
}

if (incrementSlider && incrementValue) {
    incrementSlider.addEventListener('input', () => {
        incrementValue.textContent = incrementSlider.value;
    });
}

// Sliders - Friend game
const friendMinutesSlider = document.getElementById('friendMinutesSlider');
const friendMinutesValue = document.getElementById('friendMinutesValue');
const friendIncrementSlider = document.getElementById('friendIncrementSlider');
const friendIncrementValue = document.getElementById('friendIncrementValue');

if (friendMinutesSlider && friendMinutesValue) {
    friendMinutesSlider.addEventListener('input', () => {
        friendMinutesValue.textContent = friendMinutesSlider.value;
    });
}

if (friendIncrementSlider && friendIncrementValue) {
    friendIncrementSlider.addEventListener('input', () => {
        friendIncrementValue.textContent = friendIncrementSlider.value;
    });
}

// Forms - Create Game (Quick Game Tab)
  // Обработчик createGameForm находится внутри IIFE (bindEvents -> handleCreateGame)

  const customGameForm = document.getElementById('customGameForm');
  if (customGameForm && minutesSlider && incrementSlider) {
      // Используем FormUtils для обработки формы, если доступен
      if (window.FormUtils && window.FormUtils.createFormSubmitHandler) {
        const submitHandler = window.FormUtils.createFormSubmitHandler(
          customGameForm,
          async (formData) => {
            const minutes = parseInt(minutesSlider.value) || 5;
            const increment = parseInt(incrementSlider.value) || 0;
            const gameType = document.querySelector('#customGameForm .type-option.active');
            if (!gameType) {
              throw new Error('Выберите тип игры');
            }

            const isRated = gameType.dataset.type === 'rated';
            
            // Получаем выбранный цвет
            const colorOption = customGameForm.querySelector('.color-option.active');
            let creatorColor = 'random';
            if (colorOption) {
              const selectedColor = colorOption.dataset.color;
              if (selectedColor === 'random') {
                creatorColor = Math.random() < 0.5 ? 'white' : 'black';
              } else {
                creatorColor = selectedColor;
              }
            }

            const game = await window.createGame({
              minutes,
              increment,
              isRated,
              creatorColor: creatorColor,
              initialFen: 'startpos',
              onSuccess: (game) => {
                // Show share screen with QR code and link
                const customGameShareScreen = document.getElementById('customGameShareScreen');
                const customGameForm = document.getElementById('customGameForm');
                const customGameShareLink = document.getElementById('customGameShareLink');
                const customGameQrImage = document.getElementById('customGameQrImage');
                
                if (game && game.id) {
                  // Generate share link
                  const shareLink = `${window.location.origin}/match/${game.id}`;
                  
                  // Update link input
                  if (customGameShareLink) {
                    customGameShareLink.value = shareLink;
                  }
                  
                  // Update QR code
                  if (customGameQrImage) {
                    const encoded = encodeURIComponent(shareLink);
                    const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=svg&data=${encoded}`;
                    customGameQrImage.src = qrUrl;
                    customGameQrImage.alt = 'QR-код приглашения';
                  }
                  
                  // Hide form and show share screen
                  if (customGameForm) customGameForm.style.display = 'none';
                  if (customGameShareScreen) {
                    customGameShareScreen.style.display = 'block';
                    customGameShareScreen.classList.add('active');
                  }
                  
                  // Start polling for second player
                  startWaitingForOpponent(game.id);
                }
              },
              onError: (err, message) => {
                // Error already handled in createGame
                throw new Error(message || 'Не удалось создать игру');
              }
            });
            
            if (!game) {
              throw new Error('Не удалось создать игру');
            }
          }
        );
        customGameForm.addEventListener('submit', submitHandler);
      } else {
        // Fallback для обратной совместимости
        customGameForm.addEventListener('submit', async (e) => {
          e.preventDefault();
            
            const submitBtn = customGameForm.querySelector('button[type="submit"]');
            if (submitBtn) submitBtn.disabled = true;

            try {
                const minutes = parseInt(minutesSlider.value) || 5;
                const increment = parseInt(incrementSlider.value) || 0;
                const gameType = document.querySelector('#customGameForm .type-option.active');
                if (!gameType) {
                    if (submitBtn) submitBtn.disabled = false;
              return;
          }

          const isRated = gameType.dataset.type === 'rated';
          
          // Получаем выбранный цвет
          const colorOption = customGameForm.querySelector('.color-option.active');
          let creatorColor = 'random';
          if (colorOption) {
              const selectedColor = colorOption.dataset.color;
              if (selectedColor === 'random') {
                  creatorColor = Math.random() < 0.5 ? 'white' : 'black';
              } else {
                  creatorColor = selectedColor;
              }
          }

                const game = await window.createGame({
                    minutes,
                    increment,
                    isRated,
                    creatorColor: creatorColor,
                    initialFen: 'startpos',
                    onSuccess: (game) => {
                        // Show share screen with QR code and link
                        const customGameShareScreen = document.getElementById('customGameShareScreen');
                        const customGameForm = document.getElementById('customGameForm');
                        const customGameShareLink = document.getElementById('customGameShareLink');
                        const customGameQrImage = document.getElementById('customGameQrImage');
                        
                        if (game && game.id) {
                            // Generate share link
                            const shareLink = `${window.location.origin}/match/${game.id}`;
                            
                            // Update link input
                            if (customGameShareLink) {
                                customGameShareLink.value = shareLink;
                            }
                            
                            // Update QR code
                            if (customGameQrImage) {
                                const encoded = encodeURIComponent(shareLink);
                                const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=220x220&format=svg&data=${encoded}`;
                                customGameQrImage.src = qrUrl;
                                customGameQrImage.alt = 'QR-код приглашения';
                            }
                            
                            // Hide form and show share screen
                            if (customGameForm) customGameForm.style.display = 'none';
                            if (customGameShareScreen) {
                                customGameShareScreen.style.display = 'block';
                                customGameShareScreen.classList.add('active');
                            }
                            
                            // Start polling for second player
                            startWaitingForOpponent(game.id);
                        }
                    },
                    onError: (err, message) => {
                        // Error already handled in createGame
                        if (submitBtn) submitBtn.disabled = false;
                    }
                });
                
                if (!game && submitBtn) {
                    submitBtn.disabled = false;
              }
          } catch (err) {
              if (submitBtn) submitBtn.disabled = false;
          }
      });
      }
  }

  const friendGameForm = document.getElementById('friendGameForm');
  if (friendGameForm && friendMinutesSlider && friendIncrementSlider) {
      friendGameForm.addEventListener('submit', async (e) => {
        e.preventDefault();
          
          const submitBtn = friendGameForm.querySelector('button[type="submit"]');
          if (submitBtn) submitBtn.disabled = true;

          try {
              const minutes = parseInt(friendMinutesSlider.value) || 5;
              const increment = parseInt(friendIncrementSlider.value) || 0;
              const gameType = document.querySelector('#friendGameForm .type-option.active');
              if (!gameType) {
                  if (submitBtn) submitBtn.disabled = false;
            return;
        }

        const isRated = gameType.dataset.type === 'rated';
        
        // Получаем выбранный цвет
        const colorOption = friendGameForm.querySelector('.color-option.active');
        let creatorColor = 'random';
        if (colorOption) {
            const selectedColor = colorOption.dataset.color;
            if (selectedColor === 'random') {
                creatorColor = Math.random() < 0.5 ? 'white' : 'black';
            } else {
                creatorColor = selectedColor;
            }
        }
              
              const game = await window.createGame({
                  minutes,
                  increment,
                  isRated,
                  creatorColor: creatorColor,
                  initialFen: 'startpos',
                  onSuccess: (game) => {
                      // Generate share link
                      const shareLink = document.getElementById('shareLink');
                      if (shareLink && game.id) {
                          shareLink.value = `${window.location.origin}/match/${game.id}`;
                          updateShareQrCode(shareLink.value);
                }
                      
                      // Show share screen
                      if (friendSetupScreen) friendSetupScreen.style.display = 'none';
                      if (friendShareScreen) friendShareScreen.classList.add('active');
                      
                      // Start polling for second player
                      if (game.id) {
                          startWaitingForOpponent(game.id);
                      }
                  },
                  onError: (err, message) => {
                      // Error already handled in createGame
                      if (submitBtn) submitBtn.disabled = false;
                  }
              });
              
              if (!game && submitBtn) {
                  submitBtn.disabled = false;
            }
        } catch (err) {
            if (submitBtn) submitBtn.disabled = false;
        }
    });
}

// Wait for opponent to join
let opponentPollingInterval = null;
let opponentPollingStartTime = null;
const OPPONENT_POLLING_TIMEOUT = 10 * 60 * 1000; // 10 minutes

function startWaitingForOpponent(gameId) {
    // Clear any existing polling
    if (opponentPollingInterval) {
        clearInterval(opponentPollingInterval);
        opponentPollingInterval = null;
    }
    
    // Record start time
    opponentPollingStartTime = Date.now();
    
    // Check every 2 seconds
    opponentPollingInterval = setInterval(async () => {
        try {
            // Check timeout (10 minutes)
            const elapsed = Date.now() - opponentPollingStartTime;
            if (elapsed >= OPPONENT_POLLING_TIMEOUT) {
                // Stop polling
                if (opponentPollingInterval) {
                    clearInterval(opponentPollingInterval);
                    opponentPollingInterval = null;
                }
                opponentPollingStartTime = null;
                
                // Show timeout message
                if (typeof window.showToast === 'function') {
                    window.showToast('Время ожидания истекло. Партия была удалена.', 'error');
                }
                
                // Close modals if open
                const friendGameModal = document.getElementById('friendGameModal');
                const customGameModal = document.getElementById('customGameModal');
                if (friendGameModal) friendGameModal.classList.remove('active');
                if (customGameModal) customGameModal.classList.remove('active');
                
                return;
            }
            
            const res = await window.authedFetch(`/api/games/${gameId}`);
            if (!res.ok) {
                // Game might have been deleted
                if (res.status === 404) {
                    // Stop polling
                    if (opponentPollingInterval) {
                        clearInterval(opponentPollingInterval);
                        opponentPollingInterval = null;
                    }
                    opponentPollingStartTime = null;
                    
                    // Show message
                    if (typeof window.showToast === 'function') {
                        window.showToast('Партия была удалена (время ожидания истекло).', 'error');
                    }
                    
                    // Close modals if open
                    const friendGameModal = document.getElementById('friendGameModal');
                    const customGameModal = document.getElementById('customGameModal');
                    if (friendGameModal) friendGameModal.classList.remove('active');
                    if (customGameModal) customGameModal.classList.remove('active');
                    return;
                } else {
                    }
                return;
            }

            const game = await res.json();
            
            // Check if both players have joined (including anonymous players via session_id)
            const metadata = game.metadata || {};
            const whiteReady = (game.white_id !== null && game.white_id !== undefined) || metadata.white_session_id;
            const blackReady = (game.black_id !== null && game.black_id !== undefined) || metadata.black_session_id;
            
            if (whiteReady && blackReady) {
                // Stop polling
                if (opponentPollingInterval) {
                    clearInterval(opponentPollingInterval);
                    opponentPollingInterval = null;
                }
                opponentPollingStartTime = null;
                
                // Redirect to match page
                window.location.href = `/match/${gameId}`;
            }
        } catch (err) {
            }
    }, 2000);
}

  // Stop polling when modal is closed (handlers added to existing modal handlers above)

// Copy link button for friend game modal
const copyLinkBtn = document.getElementById('copyLinkBtn');
if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
        const linkInput = document.getElementById('shareLink');
        if (linkInput) {
            try {
                await navigator.clipboard.writeText(linkInput.value);
                const originalHTML = copyLinkBtn.innerHTML;
                copyLinkBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
                setTimeout(() => {
                    copyLinkBtn.innerHTML = originalHTML;
                }, 2000);
                  if (typeof window.showToast === 'function') {
                      window.showToast('Ссылка скопирована');
                  }
            } catch (err) {
                // Fallback for older browsers
                linkInput.select();
                document.execCommand('copy');
                  if (typeof window.showToast === 'function') {
                      window.showToast('Ссылка скопирована');
                  }
            }
        }
    });
}

// Copy link button for custom game modal
const copyCustomGameLinkBtn = document.getElementById('copyCustomGameLinkBtn');
if (copyCustomGameLinkBtn) {
    copyCustomGameLinkBtn.addEventListener('click', async () => {
        const linkInput = document.getElementById('customGameShareLink');
        if (linkInput) {
            try {
                await navigator.clipboard.writeText(linkInput.value);
                const originalHTML = copyCustomGameLinkBtn.innerHTML;
                copyCustomGameLinkBtn.innerHTML = '<i class="fas fa-check"></i> Скопировано!';
                setTimeout(() => {
                    copyCustomGameLinkBtn.innerHTML = originalHTML;
                }, 2000);
                if (typeof window.showToast === 'function') {
                    window.showToast('Ссылка скопирована');
                }
            } catch (err) {
                // Fallback for older browsers
                linkInput.select();
                document.execCommand('copy');
                if (typeof window.showToast === 'function') {
                    window.showToast('Ссылка скопирована');
                }
            }
        }
    });
}

  // Lobby filters functionality
  const filterButtons = document.querySelectorAll('.lobby-filters .filter-btn[data-filter]');
  filterButtons.forEach(btn => {
    btn.addEventListener('click', function() {
      const filter = this.dataset.filter;
      
      if (filter === 'refresh') {
        // Refresh lobby games
        if (typeof window.loadWaitingRoomGames === 'function') {
          window.loadWaitingRoomGames();
        }
        // Animate refresh button
        this.style.transform = 'rotate(360deg)';
        setTimeout(() => {
          this.style.transform = 'rotate(0deg)';
        }, 500);
        return;
      }
      
      // Update active state
      filterButtons.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      this.classList.add('active');
      this.setAttribute('aria-pressed', 'true');
      
      // Filter games (this will be implemented in games.js)
      if (typeof window.filterLobbyGames === 'function') {
        window.filterLobbyGames(filter);
      }
    });
  });

  // Show/hide loading indicators
  window.showLobbyLoading = function() {
    const loading = document.getElementById('lobbyLoading');
    const empty = document.getElementById('lobbyEmpty');
    const room = document.getElementById('waitingRoom');
    if (loading) loading.style.display = 'flex';
    if (empty) empty.style.display = 'none';
    if (room) room.style.display = 'none';
  };

  window.hideLobbyLoading = function() {
    const loading = document.getElementById('lobbyLoading');
    if (loading) loading.style.display = 'none';
  };

  window.showLobbyEmpty = function() {
    const loading = document.getElementById('lobbyLoading');
    const empty = document.getElementById('lobbyEmpty');
    const room = document.getElementById('waitingRoom');
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    if (room) room.style.display = 'none';
  };

  window.showLobbyContent = function() {
    const loading = document.getElementById('lobbyLoading');
    const empty = document.getElementById('lobbyEmpty');
    const room = document.getElementById('waitingRoom');
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (room) room.style.display = 'block';
  };

  // TV loading indicators
  window.showTVLoading = function() {
    const loading = document.getElementById('tvLoading');
    const empty = document.getElementById('tvEmpty');
    const games = document.getElementById('tvGames');
    if (loading) loading.style.display = 'flex';
    if (empty) empty.style.display = 'none';
    if (games) games.style.display = 'none';
  };

  window.hideTVLoading = function() {
    const loading = document.getElementById('tvLoading');
    if (loading) loading.style.display = 'none';
  };

  window.showTVEmpty = function() {
    const loading = document.getElementById('tvLoading');
    const empty = document.getElementById('tvEmpty');
    const games = document.getElementById('tvGames');
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'flex';
    if (games) games.style.display = 'none';
  };

  window.showTVContent = function() {
    const loading = document.getElementById('tvLoading');
    const empty = document.getElementById('tvEmpty');
    const games = document.getElementById('tvGames');
    if (loading) loading.style.display = 'none';
    if (empty) empty.style.display = 'none';
    if (games) games.style.display = 'block';
  };
}); // End of DOMContentLoaded
