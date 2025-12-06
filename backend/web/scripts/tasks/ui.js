(() => {
  const TasksConstants = window.TasksConstants;
  const TasksState = window.TasksState;
  
  if (!TasksConstants || !TasksState) {
    throw new Error('Required modules not loaded. Ensure tasks/constants.js and tasks/state.js are included first.');
  }

  window.TasksUI = {
    setPuzzleStatus(message, isError = false) {
      const statusEl = document.getElementById('puzzleStatus');
      if (!statusEl) return;
      statusEl.textContent = message;
      // Удаляем все классы статуса
      statusEl.classList.remove('error', 'success');
      // Добавляем соответствующий класс
      if (isError) {
        statusEl.classList.add('error');
      } else {
        statusEl.classList.add('success');
      }
    },

    renderModes() {
      const grid = document.getElementById('modeGrid');
      if (!grid) return;
      
      grid.innerHTML = '';
      
      TasksConstants.MODES.forEach((mode) => {
        const meta = window.TasksUtils.getModeMeta(mode);
        const isActive = mode.id === TasksState.selectedMode.id;
        
        const card = document.createElement('div');
        card.className = `mode-card ${isActive ? 'active' : ''}`;
        card.dataset.mode = mode.id;
        card.setAttribute('role', 'listitem');
        card.setAttribute('tabindex', '0');
        card.setAttribute('aria-label', `${mode.name}. ${mode.description}`);
        card.setAttribute('aria-pressed', isActive ? 'true' : 'false');
        // Фон устанавливается через CSS, не через инлайн-стиль
        card.addEventListener('click', () => window.TasksMain.selectMode(mode.id));
        card.addEventListener('keydown', (e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            window.TasksMain.selectMode(mode.id);
          }
        });
        
        const header = document.createElement('div');
        header.className = 'mode-header';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'mode-icon';
        const icon = document.createElement('i');
        icon.className = `fas ${mode.icon}`;
        icon.setAttribute('aria-hidden', 'true');
        iconDiv.appendChild(icon);
        
        const nameSpan = document.createElement('span');
        nameSpan.className = 'mode-name';
        nameSpan.textContent = mode.name;
        
        header.appendChild(iconDiv);
        header.appendChild(nameSpan);
        
        const desc = document.createElement('p');
        desc.className = 'mode-description';
        desc.textContent = mode.description;
        
        card.appendChild(header);
        card.appendChild(desc);
        
        if (meta.text) {
          const metaDiv = document.createElement('div');
          metaDiv.className = 'mode-meta';
          
          const metaIcon = document.createElement('i');
          metaIcon.className = `fas ${meta.icon} mode-meta-icon`;
          metaIcon.setAttribute('aria-hidden', 'true');
          
          const metaText = document.createElement('span');
          metaText.textContent = meta.text;
          
          metaDiv.appendChild(metaIcon);
          metaDiv.appendChild(metaText);
          card.appendChild(metaDiv);
        }
        
        grid.appendChild(card);
      });
    },

    updatePuzzleHeader(puzzle) {
      const headerCard = document.getElementById('puzzleHeaderCard');
      const modeLabel = document.getElementById('currentModeLabel');
      const ratingLabel = document.getElementById('currentPuzzleRating');
      const movesLabel = document.getElementById('currentPuzzleMoves');
      
      if (headerCard) {
        if (puzzle) {
          headerCard.classList.remove('hidden');
        } else {
          headerCard.classList.add('hidden');
        }
      }

      if (modeLabel) {
        modeLabel.innerHTML = `
          <i class="fas fa-layer-group"></i>
          Режим: ${TasksState.selectedMode.name}
        `;
      }

      if (ratingLabel) {
        const value = puzzle && typeof puzzle.rating === 'number' ? puzzle.rating : '—';
        ratingLabel.innerHTML = `
          <i class="fas fa-chess"></i>
          Рейтинг: ${value}
        `;
      }

      if (movesLabel) {
        let movesCount = '—';
        if (puzzle && puzzle.moves && Array.isArray(puzzle.moves)) {
          const initialActiveColor = TasksState.initialActiveColor || 'w';
          const playerColor = TasksState.playerColor || 'b';
          let nextColor = initialActiveColor;
          let playerMovesCount = 0;
          
          for (const _move of puzzle.moves) {
            if (nextColor === playerColor) {
              playerMovesCount += 1;
            }
            nextColor = nextColor === 'w' ? 'b' : 'w';
          }
          
          movesCount = playerMovesCount;
        }
        movesLabel.innerHTML = `
          <i class="fas fa-arrows-alt"></i>
          Ходов: ${movesCount}
        `;
      }

      window.TasksUI.updatePuzzleInfo(puzzle);
    },

    updatePuzzleInfo(puzzle) {
      const infoCard = document.getElementById('puzzleInfoCard');
      const themesValue = document.getElementById('puzzleThemesValue');
      const openingValue = document.getElementById('puzzleOpeningValue');
      const popularityValue = document.getElementById('puzzlePopularityValue');
      const playsValue = document.getElementById('puzzlePlaysValue');

      if (!infoCard) return;

      if (!puzzle) {
        infoCard.classList.add('hidden');
        return;
      }

      infoCard.classList.remove('hidden');

      if (themesValue) {
        if (puzzle.themes && Array.isArray(puzzle.themes) && puzzle.themes.length > 0) {
          themesValue.innerHTML = puzzle.themes.map(theme => 
            `<span class="info-tag">${window.TasksUtils.escapeHtml(theme)}</span>`
          ).join('');
        } else {
          themesValue.textContent = '—';
        }
      }

      if (openingValue) {
        if (puzzle.opening_tags && Array.isArray(puzzle.opening_tags) && puzzle.opening_tags.length > 0) {
          openingValue.innerHTML = puzzle.opening_tags.map(tag => 
            `<span class="info-tag">${window.TasksUtils.escapeHtml(tag)}</span>`
          ).join('');
        } else {
          openingValue.textContent = '—';
        }
      }

      if (popularityValue) {
        if (typeof puzzle.popularity === 'number') {
          popularityValue.textContent = puzzle.popularity;
        } else {
          popularityValue.textContent = '—';
        }
      }

      if (playsValue) {
        if (typeof puzzle.solved_count === 'number') {
          playsValue.textContent = puzzle.solved_count.toLocaleString();
        } else if (typeof puzzle.nb_plays === 'number') {
          playsValue.textContent = puzzle.nb_plays.toLocaleString();
        } else {
          playsValue.textContent = '—';
        }
      }
    },

    updateStats() {
      const ratingValue = document.getElementById('currentRatingValue');
      const ratingStatItem = ratingValue?.closest('.stat-item');
      const streakValue = document.getElementById('streakValue');
      const streakIndicator = document.getElementById('streakIndicator');
      const streakStat = document.getElementById('streakStat');
      
      // Рейтинг показывается только в режиме рейтинга (не в выживании)
      if (ratingStatItem) {
        if (TasksState.selectedMode.id === 'rated') {
          const rating = window.TasksUtils.getCurrentPuzzleRating();
          if (ratingValue) ratingValue.textContent = rating;
          ratingStatItem.style.display = '';
        } else {
          ratingStatItem.style.display = 'none';
        }
      }
      
      // Серия показывается только в режиме выживания (не в рейтинге)
      if (streakStat) {
        if (TasksState.selectedMode.id === 'survival') {
          const streak = TasksState.sessionStats.streak;
          if (streakValue) streakValue.textContent = streak;
          streakStat.style.display = '';
          
          // Визуальная индикация активной серии (более 3 решенных подряд)
          if (streakIndicator) {
            if (streak >= 3) {
              streakIndicator.classList.add('active');
              // Анимация при увеличении серии
              if (streakValue) {
                streakValue.style.animation = 'none';
                setTimeout(() => {
                  streakValue.style.animation = 'streakIncrease 0.5s ease-out';
                }, 10);
              }
            } else {
              streakIndicator.classList.remove('active');
            }
          }
        } else {
          streakStat.style.display = 'none';
        }
      }
    },

    updateTime() {
      const timeValue = document.getElementById('currentTimeValue');
      if (!timeValue || !TasksState.puzzleStartTime) return;
      
      const elapsed = Math.floor((Date.now() - TasksState.puzzleStartTime) / 1000);
      const minutes = Math.floor(elapsed / 60);
      const seconds = elapsed % 60;
      timeValue.textContent = `${String(minutes).padStart(2, '0')}:${String(seconds).padStart(2, '0')}`;
    },

    startTimeTracking() {
      TasksState.puzzleStartTime = Date.now();
      if (TasksState.timeInterval) clearInterval(TasksState.timeInterval);
      TasksState.timeInterval = setInterval(() => window.TasksUI.updateTime(), 1000);
    },

    stopTimeTracking() {
      if (TasksState.timeInterval) {
        clearInterval(TasksState.timeInterval);
        TasksState.timeInterval = null;
      }
    },

  };
})();

