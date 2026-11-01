/**
 * ============================================================================
 * SMART SPLIT - RECEIPT & BILL SCANNER (js/scanner.js)
 * Client-side image compression, OCR processing & auto total extraction
 * ============================================================================
 */

window.SmartSplit = window.SmartSplit || {};

(function () {
  'use strict';

  /**
   * Compress and resize an image file into a lightweight base64 JPEG data URL
   * @param {File|Blob} file 
   * @param {number} [maxDim=1280] 
   * @param {number} [quality=0.82] 
   * @returns {Promise<{ dataUrl: string, width: number, height: number }>}
   */
  function compressImage(file, maxDim = 1280, quality = 0.82) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = reject;
      reader.onload = (e) => {
        const img = new Image();
        img.onerror = reject;
        img.onload = () => {
          let { width, height } = img;

          // Scale down if larger than maxDim
          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL('image/jpeg', quality);
          resolve({ dataUrl, width, height });
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /**
   * Extract total monetary amount from receipt OCR text
   * Handles Thai bank slips, restaurant bills, 7-11 receipts, Grab receipts, etc.
   * @param {string} text 
   * @returns {number|null}
   */
  function extractTotalFromText(text) {
    if (!text) return null;

    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);

    // 1. High-confidence regex patterns with explicit total labels
    const totalLabelPatterns = [
      /(?:ยอดสุทธิ|รวมทั้งสิ้น|จำนวนเงิน|ยอดรวม|รวมเงิน|ยอดชำระ|ชำระทั้งหมด|ยอดเงิน|total\s*due|grand\s*total|net\s*amount|total|amount|subtotal)[\s:฿THBbaht]*([0-9,]+\.?[0-9]{0,2})/i,
      /([0-9,]+\.[0-9]{2})\s*(?:บาท|thb|baht)/i,
      /฿\s*([0-9,]+\.[0-9]{2})/i
    ];

    for (const pattern of totalLabelPatterns) {
      for (const line of lines) {
        const match = line.match(pattern);
        if (match && match[1]) {
          const cleanNum = parseFloat(match[1].replace(/,/g, ''));
          if (!isNaN(cleanNum) && cleanNum > 0 && cleanNum < 5000000) {
            return cleanNum;
          }
        }
      }
    }

    // 2. Candidate collection: find all numbers with 2 decimal places
    const candidates = [];
    for (let i = lines.length - 1; i >= 0; i--) {
      const line = lines[i];
      // Skip dates like 2026.11.01 or times like 18.45
      if (line.match(/\d{4}[-/.]\d{2}[-/.]\d{2}/) || line.match(/\d{2}:\d{2}/)) {
        continue;
      }

      const matches = [...line.matchAll(/(?:^|[^\d.,])([0-9]{1,3}(?:,[0-9]{3})*(?:\.[0-9]{2}))(?:[^\d.,]|$)/g)];
      for (const m of matches) {
        const val = parseFloat(m[1].replace(/,/g, ''));
        if (!isNaN(val) && val > 0 && val < 5000000) {
          candidates.push(val);
        }
      }
    }

    if (candidates.length > 0) {
      // In receipt layout, the largest candidate is almost always the Grand Total
      return Math.max(...candidates);
    }

    // 3. Fallback: integer numbers without decimals if formatted as price
    const intCandidates = [];
    for (const line of lines) {
      const match = line.match(/(?:total|amount|ยอดรวม|จำนวนเงิน|ชำระ)[\s:฿]*([0-9,]{2,7})/i);
      if (match && match[1]) {
        const val = parseInt(match[1].replace(/,/g, ''), 10);
        if (!isNaN(val) && val > 0 && val < 5000000) {
          intCandidates.push(val);
        }
      }
    }

    if (intCandidates.length > 0) {
      return Math.max(...intCandidates);
    }

    return null;
  }

  /**
   * Suggest an expense title based on merchant/slip keywords
   * @param {string} text 
   * @returns {string|null}
   */
  function suggestExpenseTitle(text) {
    if (!text) return null;
    const lower = text.toLowerCase();

    if (lower.includes('7-eleven') || lower.includes('seven') || lower.includes('เซเว่น')) return 'เซเว่น';
    if (lower.includes('starbucks') || lower.includes('cafe') || lower.includes('coffee') || lower.includes('amazon')) return 'ค่ากาแฟ';
    if (lower.includes('shabu') || lower.includes('ชาบู') || lower.includes('sukishi') || lower.includes('momo')) return 'ค่าชาบู';
    if (lower.includes('hotel') || lower.includes('resort') || lower.includes('villa') || lower.includes('ที่พัก')) return 'ค่าที่พัก';
    if (lower.includes('grab') || lower.includes('bolt') || lower.includes('taxi')) return 'ค่ารถเดินทาง';
    if (lower.includes('fuel') || lower.includes('ptt') || lower.includes('shell') || lower.includes('caltex') || lower.includes('น้ำมัน')) return 'ค่าน้ำมัน';
    if (lower.includes('kbank') || lower.includes('scb') || lower.includes('promptpay') || lower.includes('โอนเงินสำเร็จ')) return 'สลิปโอนเงิน';

    return null;
  }

  /**
   * Scan receipt image with OCR and extract total
   * @param {string} imageDataUrl 
   * @param {function} [onProgress] 
   * @returns {Promise<{ success: boolean, total: number|null, descSuggestion: string|null, rawText: string }>}
   */
  async function scanReceipt(imageDataUrl, onProgress) {
    // Check if Tesseract.js is available on window
    if (typeof window.Tesseract === 'undefined') {
      return {
        success: false,
        total: null,
        descSuggestion: null,
        rawText: '',
        error: 'Tesseract library not loaded'
      };
    }

    try {
      if (typeof onProgress === 'function') onProgress({ status: 'initializing', progress: 0.1 });

      const result = await window.Tesseract.recognize(imageDataUrl, 'eng', {
        logger: (m) => {
          if (typeof onProgress === 'function' && m.status === 'recognizing text') {
            onProgress({ status: 'recognizing', progress: m.progress || 0.5 });
          }
        }
      });

      const rawText = result?.data?.text || '';
      const total = extractTotalFromText(rawText);
      const descSuggestion = suggestExpenseTitle(rawText);

      return {
        success: true,
        total,
        descSuggestion,
        rawText
      };
    } catch (err) {
      console.warn('[Scanner] OCR failed or was aborted:', err);
      return {
        success: false,
        total: null,
        descSuggestion: null,
        rawText: '',
        error: err.message
      };
    }
  }

  window.SmartSplit.Scanner = {
    compressImage,
    extractTotalFromText,
    suggestExpenseTitle,
    scanReceipt
  };
})();
