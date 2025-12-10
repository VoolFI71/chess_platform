// Extracted from index.html inline scripts

// Auth helpers
function getAccessToken() {
  try { return localStorage.getItem('access_token') || ''; } catch { return ''; }
}
function getRefreshToken() {
  try { return localStorage.getItem('refresh_token') || ''; } catch { return ''; }
}
function setTokens(access, refresh) {
  try {
    if (access) localStorage.setItem('access_token', access);
    if (refresh) localStorage.setItem('refresh_token', refresh);
  } catch {}
}

async function authedFetch(path, options = {}) {
  const headers = new Headers(options.headers || {});
  const token = getAccessToken();
  if (token) headers.set('Authorization', `Bearer ${token}`);
  if (options.body && !headers.has('Content-Type')) headers.set('Content-Type', 'application/json');
  let res = await fetch(path, { ...options, headers });
  if (res.status !== 401 && res.status !== 403) return res;
  const rt = getRefreshToken();
  if (!rt) return res;
  try {
    const rf = await fetch('/api/auth/refresh', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refresh_token: rt }),
    });
    if (!rf.ok) return res;
    const data = await rf.json();
    setTokens(data.access_token, data.refresh_token);
    const headers2 = new Headers(options.headers || {});
    const token2 = getAccessToken();
    if (token2) headers2.set('Authorization', `Bearer ${token2}`);
    if (options.body && !headers2.has('Content-Type')) headers2.set('Content-Type', 'application/json');
    res = await fetch(path, { ...options, headers: headers2 });
    return res;
  } catch {
    return res;
  }
}

// Mobile menu functions теперь в mobile-menu.js

// Header scroll
function handleScroll() {
  const header = document.getElementById('header');
  if (!header) return;
  if (window.scrollY > 50) header.classList.add('scrolled');
  else header.classList.remove('scrolled');
}

// Collapsible
function toggleCollapsible(id) {
  const content = document.getElementById(id);
  const icon = document.getElementById('toggleIcon');
  const text = document.getElementById('toggleText');
  if (!content) return;
  content.classList.toggle('active');
  if (icon && text) {
    if (content.classList.contains('active')) { icon.style.transform = 'rotate(180deg)'; text.textContent = 'Скрыть детали'; }
    else { icon.style.transform = 'rotate(0deg)'; text.textContent = 'Показать всё'; }
  }
}

// Review filters
function filterReviews(course) {
  const filterBtns = document.querySelectorAll('.filter-btn');
  const reviewCards = document.querySelectorAll('.review-card');
  filterBtns.forEach(btn => btn.classList.remove('active'));
  if (event && event.target) event.target.closest('.filter-btn')?.classList.add('active');
  reviewCards.forEach(card => {
    if (course === 'all' || card.dataset.course === course) card.classList.add('show');
    else card.classList.remove('show');
  });
}

// Chess board
function createChessBoard() {
  const board = document.getElementById('chessBoard');
  if (!board) return;
  board.innerHTML = '';
  const initialPosition = [
    ['♜','♞','♝','♛','♚','♝','♞','♜'],
    ['♟','♟','♟','♟','♟','♟','♟','♟'],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['','','','','','','',''],
    ['♙','♙','♙','♙','♙','♙','♙','♙'],
    ['♖','♘','♗','♕','♔','♗','♘','♖']
  ];
  for (let r = 0; r < 8; r++) {
    for (let c = 0; c < 8; c++) {
      const sq = document.createElement('div');
      sq.className = `chess-square ${(r + c) % 2 === 0 ? 'light' : 'dark'}`;
      sq.innerHTML = initialPosition[r][c];
      board.appendChild(sq);
    }
  }
}

function showPurchaseModal() {
  if (window.modalUtils) {
    modalUtils.openModal('purchaseModal', { onOpen: createChessBoard });
  } else {
    const modal = document.getElementById('purchaseModal');
    if (modal) {
      modal.classList.add('active');
      createChessBoard();
    }
  }
}
function closePurchaseModal() {
  if (window.modalUtils) {
    modalUtils.closeModal('purchaseModal');
  } else {
    const modal = document.getElementById('purchaseModal');
    if (modal) modal.classList.remove('active');
  }
}
function completePurchase() { alert('🎉 Покупка успешно завершена. Добро пожаловать в ChessMint!'); closePurchaseModal(); }

// Smooth scroll and events
document.querySelectorAll('a[href^="#"]').forEach(anchor => {
  anchor.addEventListener('click', function(e) {
    const href = this.getAttribute('href');
    if (href !== '#' && href !== '#login' && href !== '#start') {
      e.preventDefault();
      const target = document.querySelector(href);
      if (target) { target.scrollIntoView({ behavior: 'smooth', block: 'start' }); closeMobileMenu(); }
    }
  });
});

window.addEventListener('scroll', handleScroll, { passive: true });
window.addEventListener('resize', () => { if (window.innerWidth >= 1024) closeMobileMenu(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { closeMobileMenu(); } });

// Load and display global statistics
async function loadGlobalStats() {
  try {
    const res = await fetch('/api/stats/global');
    if (!res.ok) {
      console.warn('Failed to load global stats:', res.status);
      return;
    }
    const stats = await res.json();
    
    // Update stat elements
    const statUsers = document.getElementById('stat-users');
    const statPuzzlesSolved = document.getElementById('stat-puzzles-solved');
    const statGamesPlayed = document.getElementById('stat-games-played');
    const statTotalPuzzles = document.getElementById('stat-total-puzzles');
    
    if (statUsers) {
      statUsers.textContent = formatNumber(stats.total_users || 0);
    }
    if (statPuzzlesSolved) {
      statPuzzlesSolved.textContent = formatNumber(stats.total_puzzle_solutions || 0);
    }
    if (statGamesPlayed) {
      statGamesPlayed.textContent = formatNumber(stats.total_games_played || 0);
    }
    if (statTotalPuzzles) {
      statTotalPuzzles.textContent = formatNumber(stats.total_puzzles || 0);
    }
  } catch (err) {
    console.error('Error loading global stats:', err);
  }
}

// Format numbers with thousand separators
function formatNumber(num) {
  return new Intl.NumberFormat('ru-RU').format(num);
}

document.addEventListener('DOMContentLoaded', () => {
  if (typeof loadTheme === 'function') loadTheme();
  console.log('🏁 ChessMint Loaded Successfully!');
  
  // Load global statistics
  loadGlobalStats();

  // Wire hero CTA: Начать обучение
  const startCta = document.querySelector('a[href="#start"].btn.btn-primary');
  if (startCta) {
    startCta.addEventListener('click', async (e) => {
      e.preventDefault();
      // If logged in -> go to cabinet, else open login/register
      try {
        const res = await authedFetch('/api/auth/me');
        if (res && res.ok) {
          const user = await res.json();
          const username = user?.username;
          window.location.href = username ? `/profile/${encodeURIComponent(username)}` : '/profile';
        } else {
          if (typeof showLoginModal === 'function') showLoginModal();
        }
      } catch {
        if (typeof showLoginModal === 'function') showLoginModal();
      }
    });
  }

  // Wire free course enroll (Grobb id=1)
  const freeCourseButton = document.querySelector('[data-free-course="grob"]');
  if (freeCourseButton) {
    freeCourseButton.addEventListener('click', async (e) => {
      e.preventDefault();
      try {
        // Check auth
        const me = await authedFetch('/api/auth/me');
        if (!me || !me.ok) {
          if (typeof showLoginModal === 'function') showLoginModal();
          return;
        }
        const enroll = await authedFetch('/api/courses/1/enroll', { method: 'POST' });
        if (enroll && enroll.ok) {
          alert('✅ Курс добавлен на ваш аккаунт');
          const user = await me.json();
          const username = user?.username;
          window.location.href = username ? `/profile/${encodeURIComponent(username)}` : '/profile';
        } else {
          const msg = await enroll.text();
          alert('Не удалось выдать доступ: ' + msg);
        }
      } catch (err) {
        alert('Не удалось выдать доступ. Попробуйте позже.');
      }
    });
  }

  // Reflect ownership of free course (id=1)
  (async () => {
    try {
      const res = await authedFetch('/api/courses/me');
      if (!res || !res.ok) return;
      const myCourses = await res.json();
      const hasGrob = Array.isArray(myCourses) && myCourses.some(c => c.id === 1 || c.slug === 'grob-free');
      if (hasGrob && freeCourseButton) {
        freeCourseButton.textContent = 'Уже в вашем аккаунте';
        freeCourseButton.classList.remove('btn-success');
        freeCourseButton.classList.add('btn-outline');
        freeCourseButton.onclick = async (e) => { 
          e.preventDefault(); 
          try {
            const userRes = await authedFetch('/api/auth/me');
            if (userRes && userRes.ok) {
              const user = await userRes.json();
              const username = user?.username;
              window.location.href = username ? `/profile/${encodeURIComponent(username)}` : '/profile';
            } else {
              window.location.href = '/profile';
            }
          } catch {
            window.location.href = '/profile';
          }
        };
      }
    } catch {}
  })();
});

// Mobile menu functions теперь в mobile-menu.js
window.toggleCollapsible = toggleCollapsible;
window.filterReviews = filterReviews;
window.showPurchaseModal = showPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.completePurchase = completePurchase;
window.createChessBoard = createChessBoard;


