/**
 * ============================================================================
 * SMART SPLIT - UTILITY FUNCTIONS (js/utils.js)
 * ============================================================================
 */

window.SmartSplit = window.SmartSplit || {};

(function () {
  'use strict';

  /**
   * Format currency number into Thai Baht locale with commas and 2 decimal places
   * @param {number|string} num 
   * @returns {string} e.g. "1,250.00"
   */
  function formatCurrency(num) {
    return (Number(num) || 0).toLocaleString('th-TH', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2
    });
  }

  /**
   * Escape HTML entities to prevent XSS injection
   * @param {string} str 
   * @returns {string}
   */
  function escapeHtml(str) {
    return (str || '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Get an appropriate category icon SVG for an expense
   * @param {string} desc 
   * @returns {string} SVG HTML string
   */
  function getExpenseCategoryIcon(desc) {
    const map = window.SmartSplit.Constants?.CATEGORY_MAP || {};
    const lower = (desc || '').toLowerCase();
    for (const [key, iconName] of Object.entries(map)) {
      if (lower.includes(key)) {
        return window.SmartSplit.Icons?.get(iconName) || window.SmartSplit.Icons?.get('general');
      }
    }
    return window.SmartSplit.Icons?.get('receipt');
  }

  let toastTimer = null;

  /**
   * Show temporary toast notification message with SVG icon
   * @param {string} msg 
   * @param {'success'|'warning'|'info'} [type='success']
   */
  function showToast(msg, type = 'success') {
    const popup = document.getElementById('toastPopup');
    const msgEl = document.getElementById('toastMessage');
    const iconContainer = document.getElementById('toastIcon');
    if (!popup || !msgEl) return;

    msgEl.textContent = msg;

    if (iconContainer && window.SmartSplit.Icons) {
      if (type === 'warning') {
        iconContainer.innerHTML = window.SmartSplit.Icons.get('sparkles');
      } else {
        iconContainer.innerHTML = window.SmartSplit.Icons.get('checkCircle');
      }
    }

    popup.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      popup.classList.remove('show');
    }, 2800);
  }

  /**
   * Fallback text copy using temporary textarea when navigator.clipboard is unavailable
   * @param {string} text 
   * @param {string} successMsg 
   */
  function fallbackCopyText(text, successMsg = 'คัดลอกข้อความสรุปเรียบร้อยแล้ว') {
    const textarea = document.createElement('textarea');
    textarea.value = text;
    textarea.style.position = 'fixed';
    textarea.style.opacity = '0';
    document.body.appendChild(textarea);
    textarea.select();
    try {
      document.execCommand('copy');
      showToast(successMsg, 'success');
    } catch (err) {
      alert('ไม่สามารถคัดลอกอัตโนมัติได้ กรุณาคัดลอกด้วยตนเอง');
    }
    document.body.removeChild(textarea);
  }

  window.SmartSplit.Utils = {
    formatCurrency,
    escapeHtml,
    getExpenseCategoryIcon,
    showToast,
    fallbackCopyText
  };
})();
