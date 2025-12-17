/**
 * Mobile Menu Functions
 * Централизованный скрипт для управления мобильным меню на всех страницах
 */

(function() {
  'use strict';

  /**
   * Переключает видимость мобильного меню
   */
  function toggleMobileMenu() {
    console.log('[toggleMobileMenu] Function called');
    const menu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const icon = document.getElementById('menuIcon');
    const menuBtn = document.getElementById('mobileMenuBtn') || document.querySelector('.mobile-menu-btn');
    
    console.log('[toggleMobileMenu] Elements found:', {
      menu: !!menu,
      overlay: !!overlay,
      icon: !!icon,
      menuBtn: !!menuBtn
    });
    
    if (!menu) {
      console.error('[toggleMobileMenu] Menu element not found! Cannot toggle.');
      return;
    }
    
    const isActive = menu.classList.contains('active');
    console.log('[toggleMobileMenu] Current state - isActive:', isActive);
    console.log('[toggleMobileMenu] Menu classes before:', menu.className);
    console.log('[toggleMobileMenu] Menu computed display:', window.getComputedStyle(menu).display);
    
    if (isActive) {
      console.log('[toggleMobileMenu] Closing menu...');
      menu.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
      console.log('[toggleMobileMenu] Menu closed');
    } else {
      console.log('[toggleMobileMenu] Opening menu...');
      menu.classList.add('active');
      console.log('[toggleMobileMenu] Menu classes after add:', menu.className);
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
      console.log('[toggleMobileMenu] Menu opened');
    }
    
    console.log('[toggleMobileMenu] Menu classes after toggle:', menu.className);
    console.log('[toggleMobileMenu] Menu computed display after:', window.getComputedStyle(menu).display);
    console.log('[toggleMobileMenu] Menu has active class:', menu.classList.contains('active'));
    
    // Обновляем aria-expanded для доступности
    if (menuBtn) {
      const ariaExpanded = menu.classList.contains('active') ? 'true' : 'false';
      menuBtn.setAttribute('aria-expanded', ariaExpanded);
      menuBtn.setAttribute('aria-label', menu.classList.contains('active') ? 'Закрыть меню' : 'Открыть меню');
      console.log('[toggleMobileMenu] Updated aria-expanded to:', ariaExpanded);
    }
    
    if (icon) {
      icon.className = menu.classList.contains('active') ? 'fas fa-times' : 'fas fa-bars';
      console.log('[toggleMobileMenu] Updated icon class to:', icon.className);
    }
    
    console.log('[toggleMobileMenu] Function completed');
  }

  /**
   * Закрывает мобильное меню
   */
  function closeMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const icon = document.getElementById('menuIcon');
    const menuBtn = document.getElementById('mobileMenuBtn') || document.querySelector('.mobile-menu-btn');
    
    if (menu) menu.classList.remove('active');
    if (overlay) overlay.classList.remove('active');
    if (icon) icon.className = 'fas fa-bars';
    document.body.style.overflow = '';
    
    // Обновляем aria-expanded для доступности
    if (menuBtn) {
      menuBtn.setAttribute('aria-expanded', 'false');
      menuBtn.setAttribute('aria-label', 'Открыть меню');
    }
  }

  // Экспортируем функции в глобальную область видимости для использования в onclick и других скриптах
  window.toggleMobileMenu = toggleMobileMenu;
  window.closeMobileMenu = closeMobileMenu;

  // Инициализация при загрузке DOM
  document.addEventListener('DOMContentLoaded', function() {
    console.log('[Mobile Menu Init] mobile-menu.js DOMContentLoaded fired');
    
    // Убеждаемся, что меню закрыто при загрузке страницы
    const menu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const menuBtn = document.getElementById('mobileMenuBtn') || document.querySelector('.mobile-menu-btn');
    
    if (menu) {
      const isInitiallyActive = menu.classList.contains('active');
      console.log('[Mobile Menu Init] Initial state check - menu has active class:', isInitiallyActive);
      
      if (isInitiallyActive) {
        console.warn('[Mobile Menu Init] Menu was open on page load! Closing it...');
        closeMobileMenu();
        console.log('[Mobile Menu Init] Menu closed');
      }
      
      // Убеждаемся, что aria-атрибуты установлены правильно
      if (menuBtn) {
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', 'Открыть меню');
        console.log('[Mobile Menu Init] Set aria-expanded to false');
      }
    }
    
    // Закрываем меню при изменении размера окна (если перешли на десктоп)
    window.addEventListener('resize', function() {
      if (window.innerWidth >= 1024) {
        closeMobileMenu();
      }
    });

    // Закрываем меню по Escape
    document.addEventListener('keydown', function(e) {
      if (e.key === 'Escape') {
        const menu = document.getElementById('mobileMenu');
        if (menu && menu.classList.contains('active')) {
          closeMobileMenu();
        }
      }
    });

    // Закрываем меню при клике на ссылки внутри меню
    document.querySelectorAll('.mobile-nav-link, .mobile-login-link, .mobile-cabinet-link').forEach(function(link) {
      link.addEventListener('click', closeMobileMenu);
    });
    
    console.log('[Mobile Menu Init] Initialization completed');
  });
})();

