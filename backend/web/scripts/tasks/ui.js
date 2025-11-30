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
      statusEl.style.color = isError ? '#dc2626' : 'var(--muted-foreground)';
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
        if (isActive) {
          card.style.background = mode.gradient;
        }
        card.addEventListener('click', () => window.TasksMain.selectMode(mode.id));
        
        const header = document.createElement('div');
        header.className = 'mode-header';
        
        const iconDiv = document.createElement('div');
        iconDiv.className = 'mode-icon';
        const icon = document.createElement('i');
        icon.className = `fas ${mode.icon}`;
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
        headerCard.style.display = puzzle ? 'block' : 'none';
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
        infoCard.style.display = 'none';
        return;
      }

      infoCard.style.display = 'block';

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
      const streakValue = document.getElementById('streakValue');
      
      if (ratingValue) {
        const rating = window.TasksUtils.getCurrentPuzzleRating();
        ratingValue.textContent = rating;
      }
      
      if (streakValue) {
        if (TasksState.selectedMode.id === 'survival') {
          streakValue.textContent = TasksState.sessionStats.streak;
        } else {
          streakValue.textContent = '—';
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

