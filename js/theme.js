/**
 * ============================================================================
 * SMART SPLIT - THEME MANAGEMENT (js/theme.js)
 * Clean vector SVG theme toggle
 * ============================================================================
 */

window.SmartSplit = window.SmartSplit || {};

(function () {
  'use strict';

  /**
   * Initialize theme from localStorage or system prefers-color-scheme
   */
  function initTheme() {
    try {
      const saved = localStorage.getItem('smartsplit-theme');
      if (saved === 'dark') {
        document.documentElement.setAttribute('data-theme', 'dark');
      } else if (saved === 'light') {
        document.documentElement.removeAttribute('data-theme');
      } else {
        if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
          document.documentElement.setAttribute('data-theme', 'dark');
        }
      }
    } catch (e) {
      console.warn('Theme storage access error:', e);
    }
    updateToggleIcon();
  }

  /**
   * Toggle between light and dark themes
   */
  function toggleTheme() {
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    try {
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('smartsplit-theme', 'light');
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('smartsplit-theme', 'dark');
      }
    } catch (e) {
      console.warn('Theme toggle save error:', e);
    }
    updateToggleIcon();
  }

  /**
   * Update header toggle button icon with vector SVG
   */
  function updateToggleIcon() {
    const btn = document.getElementById('btnToggleTheme');
    if (!btn) return;
    const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
    const iconSpan = btn.querySelector('.theme-toggle-icon');
    if (iconSpan && window.SmartSplit.Icons) {
      iconSpan.innerHTML = isDark
        ? window.SmartSplit.Icons.get('sun')
        : window.SmartSplit.Icons.get('moon');
    }
    if (typeof btn.setAttribute === 'function') {
      btn.setAttribute('aria-label', isDark ? 'เปลี่ยนเป็นธีมสว่าง' : 'เปลี่ยนเป็นธีมมืด');
    }
  }

  window.SmartSplit.Theme = {
    initTheme,
    toggleTheme,
    updateToggleIcon
  };
})();
