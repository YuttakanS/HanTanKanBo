/**
 * ============================================================================
 * SMART SPLIT - APPLICATION CONTROLLER & STATE MANAGER (js/app.js)
 * Friendly, playful Thai tone, state management, bill scanner & image attachments
 * ============================================================================
 */

window.SmartSplit = window.SmartSplit || {};

(function () {
  'use strict';

  const { AVATAR_COLORS } = window.SmartSplit.Constants;
  const { formatCurrency, showToast, fallbackCopyText } = window.SmartSplit.Utils;
  const { calculateSettlement, calculateRawBillTransfers } = window.SmartSplit.Solver;
  const UI = window.SmartSplit.UI;
  const Theme = window.SmartSplit.Theme;

  // Application Global State
  const state = {
    friends: [],   // Array<{ id: number, name: string, color: string }>
    expenses: [],  // Array<{ id: string, desc: string, payerId: number, amount: number, consumerIds: number[], billImage?: string }>
    transfersDone: {} // Map of transfer keys marked as paid
  };

  // Currently attached bill image (base64 data URL) for the expense being entered
  let currentBillImage = null;

  /**
   * Helper to re-render all dynamic components
   */
  function refreshAllUI() {
    UI.renderFriends(state.friends, removeFriend);
    UI.updatePayerDropdown(state.friends);
    UI.renderConsumerCheckboxes(state.friends);
    UI.renderExpensesList(state.expenses, state.friends, deleteExpense);
    UI.updatePerPersonSharePreview();
    UI.renderAllSettlement(state.friends, state.expenses, state.transfersDone, handleToggleTransferDone);
  }

  // ==========================================================================
  // FRIEND ACTIONS
  // ==========================================================================
  function addFriend(name) {
    const trimmed = (name || '').trim();
    if (!trimmed) return;

    if (state.friends.some((f) => f.name.toLowerCase() === trimmed.toLowerCase())) {
      showToast(`ชื่อ "${trimmed}" มีอยู่ในตี้แล้วนะ!`, 'warning');
      return;
    }

    const newId = state.friends.length;
    const color = AVATAR_COLORS[newId % AVATAR_COLORS.length];
    state.friends.push({ id: newId, name: trimmed, color });

    refreshAllUI();
  }

  function removeFriend(id) {
    if (id < 0 || id >= state.friends.length) return;

    state.friends.splice(id, 1);
    for (let i = 0; i < state.friends.length; i++) {
      state.friends[i].id = i;
    }

    state.expenses = state.expenses
      .filter((exp) => exp.payerId !== id)
      .map((exp) => ({
        ...exp,
        payerId: exp.payerId > id ? exp.payerId - 1 : exp.payerId,
        consumerIds: exp.consumerIds
          .filter((c) => c !== id)
          .map((c) => (c > id ? c - 1 : c))
      }))
      .filter((exp) => exp.consumerIds.length > 0);

    refreshAllUI();
  }

  // ==========================================================================
  // BILL IMAGE ATTACHMENT & OCR SCANNER
  // ==========================================================================
  async function handleBillFileSelect(file) {
    if (!file || !file.type.startsWith('image/')) {
      showToast('กรุณาเลือกไฟล์รูปภาพเท่านั้นน้า', 'warning');
      return;
    }

    try {
      // 1. Show immediate loading status
      UI.setDropzonePreview('', '🔍 กำลังเตรียมรูปภาพ...', 'scanning');

      // 2. Compress image for lightweight in-memory storage & fast OCR
      const { dataUrl } = await window.SmartSplit.Scanner.compressImage(file);
      currentBillImage = dataUrl;
      UI.setDropzonePreview(dataUrl, '🔍 กำลังส่องหาตัวเลขยอดเงิน...', 'scanning');

      // 3. Run OCR scan
      const scanResult = await window.SmartSplit.Scanner.scanReceipt(dataUrl, (progress) => {
        if (progress.status === 'recognizing') {
          const pct = Math.round(progress.progress * 100);
          UI.setDropzonePreview(dataUrl, `🔍 กำลังสแกนตัวเลข... (${pct}%)`, 'scanning');
        }
      });

      const dom = UI.getElements();

      if (scanResult.success && scanResult.total) {
        dom.inputExpenseAmount.value = scanResult.total;
        UI.updatePerPersonSharePreview();
        UI.setDropzonePreview(dataUrl, `✨ เจอยอด ${formatCurrency(scanResult.total)} บาท!`, 'success');
        showToast(`สแกนเจอยอด ${formatCurrency(scanResult.total)} บาท จากบิล!`, 'success');

        if (!dom.inputExpenseDesc.value && scanResult.descSuggestion) {
          dom.inputExpenseDesc.value = scanResult.descSuggestion;
        }
      } else {
        UI.setDropzonePreview(dataUrl, 'แนบรูปเรียบร้อย (กรอกตัวเลขยืนยันได้เลย)', 'manual');
        showToast('แนบรูปบิลเรียบร้อยแล้วจ้า', 'success');
      }
    } catch (err) {
      console.warn('Bill processing error:', err);
      UI.resetDropzonePreview();
      currentBillImage = null;
      showToast('เกิดข้อผิดพลาดในการโหลดรูปภาพ', 'warning');
    }
  }

  // ==========================================================================
  // EXPENSE ACTIONS
  // ==========================================================================
  function saveExpense() {
    const dom = UI.getElements();
    const desc = (dom.inputExpenseDesc.value || '').trim() || 'ค่าใช้จ่ายทั่วไป';
    const amount = parseFloat(dom.inputExpenseAmount.value);
    const payerId = parseInt(dom.selectPayer.value, 10);
    const consumerIds = UI.getSelectedConsumerIds();

    if (isNaN(amount) || amount <= 0) {
      showToast('อย่าลืมใส่จำนวนเงินด้วยน้า', 'warning');
      dom.inputExpenseAmount.focus();
      return;
    }

    if (state.friends.length === 0) {
      showToast('แวะไปเพิ่มเพื่อนในตี้ก่อนสิในสเต็ป 1!', 'warning');
      return;
    }

    if (isNaN(payerId) || payerId < 0) {
      showToast('ใครเป็นคนเปย์บิลนี้? เลือกก่อนเร็ว', 'warning');
      return;
    }

    if (consumerIds.length === 0) {
      showToast('เลือกคนร่วมหารอย่างน้อย 1 คนน้า', 'warning');
      return;
    }

    // Save expense with attached bill image (if any)
    state.expenses.push({
      id: 'EXP_' + Date.now(),
      desc,
      amount,
      payerId,
      consumerIds,
      billImage: currentBillImage || null
    });

    // Reset inputs & dropzone
    dom.inputExpenseDesc.value = '';
    dom.inputExpenseAmount.value = '';
    dom.inputExpenseDesc.focus();
    currentBillImage = null;
    UI.resetDropzonePreview();

    UI.selectAllConsumers();
    UI.renderExpensesList(state.expenses, state.friends, deleteExpense);
    UI.renderAllSettlement(state.friends, state.expenses, state.transfersDone, handleToggleTransferDone);
    showToast(`แปะบิล "${desc}" ลงตี้เรียบร้อย!`, 'success');
  }

  function deleteExpense(index) {
    if (index >= 0 && index < state.expenses.length) {
      state.expenses.splice(index, 1);
      UI.renderExpensesList(state.expenses, state.friends, deleteExpense);
      UI.renderAllSettlement(state.friends, state.expenses, state.transfersDone, handleToggleTransferDone);
      showToast('ลบบิลนี้ออกแล้วจ้า', 'info');
    }
  }

  function handleToggleTransferDone(transferKey, isDone, fromName, toName, cardElement) {
    if (isDone) {
      state.transfersDone[transferKey] = true;
      cardElement.classList.add('done');
      showToast(`เย้! "${fromName}" โอนให้ "${toName}" เรียบร้อยแล้ว`, 'success');
    } else {
      delete state.transfersDone[transferKey];
      cardElement.classList.remove('done');
    }
  }

  // ==========================================================================
  // COPY LINE MESSAGES (Friendly, playful & conversational)
  // ==========================================================================
  function copyLineSummary() {
    const result = calculateSettlement(state.friends, state.expenses);
    const { totalTripAmount, balances, transfers } = result;

    if (state.friends.length === 0 || state.expenses.length === 0) {
      showToast('ยังไม่มีข้อมูลค่าใช้จ่ายให้สรุปเลย', 'warning');
      return;
    }

    let text = `🧾 สรุปยอดเคลียร์ใจ ทริปจบเงินต้องเคลียร์!\n`;
    text += `💰 ยอดใช้จ่ายรวมทั้งทริป: ${formatCurrency(totalTripAmount)} บาท (${state.expenses.length} บิล)\n\n`;

    if (transfers.length === 0) {
      text += `🎉 ยอดเงินทุกคนเคลียร์ลงตัวพอดีเป๊ะ ไม่มียอดค้างโอน แยกย้ายได้!\n\n`;
    } else {
      text += `👉 ใครต้องโอนให้ใครบ้าง (ตัดหนี้วนรอบให้แล้ว โอนตามนี้รอบเดียวจบ):\n`;
      transfers.forEach((t, i) => {
        text += `${i + 1}. ${t.fromName} ➜ โอนให้ ${t.toName} : ${formatCurrency(t.amount)} บาท\n`;
      });
      text += `\n`;
    }

    text += `📊 สรุปยอดรายคน:\n`;
    balances.forEach((b) => {
      if (b.netBalance > 0.01) {
        text += `• ${b.name}: ได้รับเงินคืน +${formatCurrency(b.netBalance)} บาท (สายเปย์สำรองจ่ายไป)\n`;
      } else if (b.netBalance < -0.01) {
        text += `• ${b.name}: โอนเพิ่ม -${formatCurrency(Math.abs(b.netBalance))} บาท\n`;
      } else {
        text += `• ${b.name}: รอดตัว! เจ๊ากันพอดี 0 บาท\n`;
      }
    });

    text += `\nโอนแล้วส่งสลิปในกลุ่มด้วยน้าทุกคน 🙏✨\n(คิดเลขและตัดหนี้ให้โดย หารตังกันบ่)`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(() => {
        showToast('ก๊อปปี้สรุปยอดเรียบร้อย เอาไปแปะในไลน์กลุ่มได้เลย!', 'success');
      }).catch(() => {
        fallbackCopyText(text, 'ก๊อปปี้สรุปยอดเรียบร้อย เอาไปแปะในไลน์กลุ่มได้เลย!');
      });
    } else {
      fallbackCopyText(text, 'ก๊อปปี้สรุปยอดเรียบร้อย เอาไปแปะในไลน์กลุ่มได้เลย!');
    }
  }

  function copySecretLineMessage() {
    const optResult = calculateSettlement(state.friends, state.expenses);
    const rawResult = calculateRawBillTransfers(state.friends, state.expenses);

    const rawCount = rawResult.rawTransfers.length;
    const optCount = optResult.transfers.length;
    const savedCount = Math.max(0, rawCount - optCount);
    const percentSaved = rawCount > 0 ? Math.round((savedCount / rawCount) * 100) : 0;

    let msg = `📊 รู้ยัง? ทริปนี้ถ้าเราไม่มีเว็บช่วยคำนวณ...\n`;
    msg += `พวกเราต้องเปิดแอปธนาคารกดโอนเงินหากันถึง ${rawCount} รอบเลยนะ! 💸\n`;
    msg += `(แถมมีโอนกลับไปกลับมาตั้งหลายรอบ สลิปเต็มแชตแน่นอน)\n\n`;
    msg += `✨ แต่พอใช้เว็บนี้ ตัดหนี้วนให้เรียบร้อย:\n`;
    msg += `👉 เหลือโอนจริงแค่ ${optCount} รอบเท่านั้น! (เซฟแรงไป ${savedCount} รอบ หรือ ${percentSaved}%)\n\n`;
    msg += `โอนตามยอดที่สรุปให้ สบายใจ ไม่ต้องโอนทับซ้อนกันจ้า 🎉\n`;
    msg += `(คิดเลขและตัดหนี้ให้โดย หารตังกันบ่)`;

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(msg).then(() => {
        showToast('ก๊อปปี้ข้อมูลเปรียบเทียบเรียบร้อย!', 'success');
      }).catch(() => {
        fallbackCopyText(msg, 'ก๊อปปี้ข้อมูลเปรียบเทียบเรียบร้อย!');
      });
    } else {
      fallbackCopyText(msg, 'ก๊อปปี้ข้อมูลเปรียบเทียบเรียบร้อย!');
    }
  }

  function clearAll() {
    if (state.friends.length === 0 && state.expenses.length === 0) return;
    if (confirm('แน่ใจนะว่าจะล้างตี้ใหม่หมด? ข้อมูลบิลทั้งหมดจะหายไปเลยนะ!')) {
      state.friends = [];
      state.expenses = [];
      state.transfersDone = {};
      currentBillImage = null;
      UI.resetDropzonePreview();
      refreshAllUI();
      showToast('ล้างตี้เรียบร้อย เริ่มต้นใหม่ได้เลย!', 'info');
    }
  }

  // ==========================================================================
  // EVENT ATTACHMENTS & INITIALIZATION
  // ==========================================================================
  function initEvents() {
    const dom = UI.getElements();

    // Friend events
    dom.btnAddFriend.addEventListener('click', () => {
      addFriend(dom.inputFriendName.value);
      dom.inputFriendName.value = '';
      dom.inputFriendName.focus();
    });

    dom.inputFriendName.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        addFriend(dom.inputFriendName.value);
        dom.inputFriendName.value = '';
      }
    });

    // Bill dropzone & image attachment events
    if (dom.billDropzone && dom.inputExpenseBill) {
      dom.billDropzone.addEventListener('click', (e) => {
        // Prevent trigger if clicking on remove button
        if (e.target.closest('#btnRemoveBill')) return;
        dom.inputExpenseBill.click();
      });

      dom.inputExpenseBill.addEventListener('change', (e) => {
        if (e.target.files && e.target.files[0]) {
          handleBillFileSelect(e.target.files[0]);
        }
      });

      // Drag & Drop
      dom.billDropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dom.billDropzone.classList.add('drag-over');
      });

      dom.billDropzone.addEventListener('dragleave', () => {
        dom.billDropzone.classList.remove('drag-over');
      });

      dom.billDropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dom.billDropzone.classList.remove('drag-over');
        if (e.dataTransfer.files && e.dataTransfer.files[0]) {
          handleBillFileSelect(e.dataTransfer.files[0]);
        }
      });
    }

    if (dom.btnRemoveBill) {
      dom.btnRemoveBill.addEventListener('click', (e) => {
        e.stopPropagation();
        currentBillImage = null;
        UI.resetDropzonePreview();
        showToast('เอารูปบิลออกแล้ว', 'info');
      });
    }

    // Modal lightbox events
    if (dom.btnCloseModal) {
      dom.btnCloseModal.addEventListener('click', UI.closeImageModal);
    }
    if (dom.imageModal) {
      dom.imageModal.addEventListener('click', (e) => {
        if (e.target === dom.imageModal) UI.closeImageModal();
      });
    }
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') UI.closeImageModal();
    });

    // Expense events
    dom.btnSaveExpense.addEventListener('click', saveExpense);
    dom.inputExpenseAmount.addEventListener('input', UI.updatePerPersonSharePreview);

    dom.btnSelectAllConsumers.addEventListener('click', UI.selectAllConsumers);
    dom.btnClearAllConsumers.addEventListener('click', UI.clearAllConsumers);

    // Copy actions
    dom.btnCopyLine.addEventListener('click', copyLineSummary);
    dom.btnCopySecretLine.addEventListener('click', copySecretLineMessage);

    // View toggles
    dom.btnOpenSecretView.addEventListener('click', () => UI.openSecretView(state.friends, state.expenses));
    dom.btnHeaderSecret.addEventListener('click', () => UI.openSecretView(state.friends, state.expenses));
    dom.btnBackToMainTop.addEventListener('click', UI.backToMainView);
    dom.btnBackToMainBottom.addEventListener('click', UI.backToMainView);

    dom.btnClearAll.addEventListener('click', clearAll);
    dom.btnToggleTheme.addEventListener('click', Theme.toggleTheme);
  }

  function initApp() {
    Theme.initTheme();
    UI.initElements();
    initEvents();
    refreshAllUI();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initApp);
  } else {
    initApp();
  }

  window.SmartSplit.State = state;
  window.SmartSplit.App = {
    addFriend,
    removeFriend,
    saveExpense,
    deleteExpense,
    copyLineSummary,
    copySecretLineMessage,
    clearAll,
    refreshAllUI,
    handleBillFileSelect
  };
})();
