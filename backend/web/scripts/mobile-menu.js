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
    const menu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const icon = document.getElementById('menuIcon');
    const menuBtn = document.getElementById('mobileMenuBtn') || document.querySelector('.mobile-menu-btn');
    
    if (!menu) {
      return;
    }
    
    const isActive = menu.classList.contains('active');
    
    if (isActive) {
      menu.classList.remove('active');
      if (overlay) overlay.classList.remove('active');
      document.body.style.overflow = '';
    } else {
      menu.classList.add('active');
      if (overlay) overlay.classList.add('active');
      document.body.style.overflow = 'hidden';
    }
    
    // Обновляем aria-expanded для доступности
    if (menuBtn) {
      const ariaExpanded = menu.classList.contains('active') ? 'true' : 'false';
      menuBtn.setAttribute('aria-expanded', ariaExpanded);
      menuBtn.setAttribute('aria-label', menu.classList.contains('active') ? 'Закрыть меню' : 'Открыть меню');
    }
    
    if (icon) {
      icon.className = menu.classList.contains('active') ? 'fas fa-times' : 'fas fa-bars';
    }
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
    // Убеждаемся, что меню закрыто при загрузке страницы
    const menu = document.getElementById('mobileMenu');
    const overlay = document.getElementById('mobileMenuOverlay');
    const menuBtn = document.getElementById('mobileMenuBtn') || document.querySelector('.mobile-menu-btn');
    
    if (menu) {
      const isInitiallyActive = menu.classList.contains('active');
      
      if (isInitiallyActive) {
        closeMobileMenu();
      }
      
      // Убеждаемся, что aria-атрибуты установлены правильно
      if (menuBtn) {
        menuBtn.setAttribute('aria-expanded', 'false');
        menuBtn.setAttribute('aria-label', 'Открыть меню');
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
  });
})();

