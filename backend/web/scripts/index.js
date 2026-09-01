// Extracted from index.html inline scripts

const http = window.App?.Http;
if (!http) throw new Error('HTTP API is not initialized');

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


document.addEventListener('DOMContentLoaded', () => {
  if (typeof loadTheme === 'function') loadTheme();

  // Wire hero CTA: Начать обучение
  const startCta = document.querySelector('a[href="#start"].btn.btn-primary');
  if (startCta) {
    startCta.addEventListener('click', async (e) => {
      e.preventDefault();
      // If logged in -> go to cabinet, else open login/register
      try {
        const res = await http.apiFetch('/api/auth/me');
        if (res.ok) {
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

});

// Mobile menu functions теперь в mobile-menu.js
window.toggleCollapsible = toggleCollapsible;
window.filterReviews = filterReviews;
window.showPurchaseModal = showPurchaseModal;
window.closePurchaseModal = closePurchaseModal;
window.completePurchase = completePurchase;
window.createChessBoard = createChessBoard;
