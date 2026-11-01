/**
 * ============================================================================
 * SMART SPLIT - UI RENDERING & DOM CONTROLLER (js/ui.js)
 * Friendly, playful & casual Thai tone for friend groups & trip expenses
 * ============================================================================
 */

window.SmartSplit = window.SmartSplit || {};

(function () {
  'use strict';

  let el = null;

  /**
   * Cache DOM elements once DOM is ready
   */
  function initElements() {
    el = {
      mainView: document.getElementById('mainView'),
      secretComparisonView: document.getElementById('secretComparisonView'),
      btnOpenSecretView: document.getElementById('btnOpenSecretView'),
      btnHeaderSecret: document.getElementById('btnHeaderSecret'),
      btnBackToMainTop: document.getElementById('btnBackToMainTop'),
      btnBackToMainBottom: document.getElementById('btnBackToMainBottom'),
      inputFriendName: document.getElementById('inputFriendName'),
      btnAddFriend: document.getElementById('btnAddFriend'),
      friendsChipContainer: document.getElementById('friendsChipContainer'),
      friendCountTag: document.getElementById('friendCountTag'),
      inputExpenseDesc: document.getElementById('inputExpenseDesc'),
      inputExpenseAmount: document.getElementById('inputExpenseAmount'),
      selectPayer: document.getElementById('selectPayer'),
      consumerCheckboxGrid: document.getElementById('consumerCheckboxGrid'),
      btnSelectAllConsumers: document.getElementById('btnSelectAllConsumers'),
      btnClearAllConsumers: document.getElementById('btnClearAllConsumers'),
      shareHintText: document.getElementById('shareHintText'),
      btnSaveExpense: document.getElementById('btnSaveExpense'),
      expenseCountTag: document.getElementById('expenseCountTag'),
      expensesListContainer: document.getElementById('expensesListContainer'),
      totalLoggedExpenseText: document.getElementById('totalLoggedExpenseText'),
      statTotalTripAmount: document.getElementById('statTotalTripAmount'),
      statTotalExpensesCount: document.getElementById('statTotalExpensesCount'),
      statTotalTransfersCount: document.getElementById('statTotalTransfersCount'),
      personBalanceContainer: document.getElementById('personBalanceContainer'),
      transfersContainer: document.getElementById('transfersContainer'),
      btnCopyLine: document.getElementById('btnCopyLine'),
      btnClearAll: document.getElementById('btnClearAll'),
      btnToggleTheme: document.getElementById('btnToggleTheme'),
      toastPopup: document.getElementById('toastPopup'),
      toastMessage: document.getElementById('toastMessage'),

      // Bill dropzone & upload elements
      inputExpenseBill: document.getElementById('inputExpenseBill'),
      billDropzone: document.getElementById('billDropzone'),
      dropzoneEmpty: document.getElementById('dropzoneEmpty'),
      dropzonePreview: document.getElementById('dropzonePreview'),
      billPreviewImg: document.getElementById('billPreviewImg'),
      ocrStatus: document.getElementById('ocrStatus'),
      btnRemoveBill: document.getElementById('btnRemoveBill'),

      // Lightbox modal elements
      imageModal: document.getElementById('imageModal'),
      imageModalImg: document.getElementById('imageModalImg'),
      imageModalTitle: document.getElementById('imageModalTitle'),
      btnCloseModal: document.getElementById('btnCloseModal'),

      // Comparison View DOM Elements
      secretSavingsTitle: document.getElementById('secretSavingsTitle'),
      secretSavingsDesc: document.getElementById('secretSavingsDesc'),
      secretSavingsPill: document.getElementById('secretSavingsPill'),
      secretRawCount: document.getElementById('secretRawCount'),
      secretRawSlipCount: document.getElementById('secretRawSlipCount'),
      secretRawVolume: document.getElementById('secretRawVolume'),
      secretPingPongCount: document.getElementById('secretPingPongCount'),
      secretOptCount: document.getElementById('secretOptCount'),
      secretOptSlipCount: document.getElementById('secretOptSlipCount'),
      secretOptVolume: document.getElementById('secretOptVolume'),
      secretPingPongList: document.getElementById('secretPingPongList'),
      secretRawTransfersTableBody: document.getElementById('secretRawTransfersTableBody'),
      tableCompRawRounds: document.getElementById('tableCompRawRounds'),
      tableCompOptRounds: document.getElementById('tableCompOptRounds'),
      tableCompRawSlips: document.getElementById('tableCompRawSlips'),
      tableCompOptSlips: document.getElementById('tableCompOptSlips'),
      btnCopySecretLine: document.getElementById('btnCopySecretLine')
    };
    return el;
  }

  function getElements() {
    if (!el) initElements();
    return el;
  }

  const { formatCurrency, escapeHtml, getExpenseCategoryIcon } = window.SmartSplit.Utils;
  const { calculateSettlement, calculateRawBillTransfers } = window.SmartSplit.Solver;
  const Icons = window.SmartSplit.Icons;

  /**
   * 1. Render friends chip tags
   */
  function renderFriends(friends = [], onDeleteFriend) {
    const dom = getElements();
    dom.friendCountTag.textContent = `${friends.length} คนในตี้`;
    dom.friendsChipContainer.innerHTML = '';

    if (friends.length === 0) {
      dom.friendsChipContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Icons.get('users')}</div>
          <div>ยังไม่มีใครในตี้เลย! พิมพ์ชื่อเพื่อนข้างบนแล้วกด "ดึงเข้าตี้" ด่วน</div>
        </div>
      `;
      return;
    }

    friends.forEach((friend) => {
      const chip = document.createElement('div');
      chip.className = 'friend-chip';
      const initial = friend.name.charAt(0).toUpperCase();

      chip.innerHTML = `
        <div class="avatar-circle" style="background-color: ${friend.color};">${initial}</div>
        <span class="friend-name-text">${escapeHtml(friend.name)}</span>
        <button class="btn-delete-chip" title="เตะ ${escapeHtml(friend.name)} ออกจากตี้" data-id="${friend.id}">
          ${Icons.get('x')}
        </button>
      `;

      dom.friendsChipContainer.appendChild(chip);
    });

    dom.friendsChipContainer.querySelectorAll('.btn-delete-chip').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const id = parseInt(e.currentTarget.getAttribute('data-id'), 10);
        if (typeof onDeleteFriend === 'function') onDeleteFriend(id);
      });
    });
  }

  /**
   * 2. Update payer select dropdown
   */
  function updatePayerDropdown(friends = []) {
    const dom = getElements();
    const currentSelected = parseInt(dom.selectPayer.value, 10);
    dom.selectPayer.innerHTML = '';

    if (friends.length === 0) {
      dom.selectPayer.innerHTML = `<option value="">-- แวะไปเพิ่มเพื่อนในสเต็ป 1 ก่อนนะ --</option>`;
      return;
    }

    friends.forEach((f) => {
      const opt = document.createElement('option');
      opt.value = f.id;
      opt.textContent = `${f.name}`;
      if (f.id === currentSelected) opt.selected = true;
      dom.selectPayer.appendChild(opt);
    });
  }

  /**
   * 3. Render consumer checkbox options
   */
  function renderConsumerCheckboxes(friends = [], onSelectionChange) {
    const dom = getElements();
    dom.consumerCheckboxGrid.innerHTML = '';

    if (friends.length === 0) {
      dom.consumerCheckboxGrid.innerHTML = `
        <div class="empty-state-small">
          เพิ่มเพื่อนในขั้นตอนที่ 1 ก่อนนะ ถึงจะเลือกคนหารได้
        </div>
      `;
      return;
    }

    friends.forEach((f) => {
      const label = document.createElement('label');
      label.className = 'consumer-option selected';
      label.setAttribute('data-consumer-id', f.id);

      label.innerHTML = `
        <input type="checkbox" checked value="${f.id}">
        <span class="consumer-check-indicator">${Icons.get('check')}</span>
        <span class="consumer-name">${escapeHtml(f.name)}</span>
      `;

      label.querySelector('input').addEventListener('change', (e) => {
        label.classList.toggle('selected', e.target.checked);
        updatePerPersonSharePreview();
        if (typeof onSelectionChange === 'function') onSelectionChange();
      });

      dom.consumerCheckboxGrid.appendChild(label);
    });
  }

  /**
   * Get selected consumer IDs
   */
  function getSelectedConsumerIds() {
    const dom = getElements();
    const checkboxes = dom.consumerCheckboxGrid.querySelectorAll('input[type="checkbox"]:checked');
    const ids = [];
    checkboxes.forEach((cb) => {
      ids.push(parseInt(cb.value, 10));
    });
    return ids;
  }

  /**
   * Update per-person share estimation preview
   */
  function updatePerPersonSharePreview() {
    const dom = getElements();
    const amt = parseFloat(dom.inputExpenseAmount.value) || 0;
    const selectedIds = getSelectedConsumerIds();
    const count = selectedIds.length;

    if (count > 0 && amt > 0) {
      const share = amt / count;
      dom.shareHintText.textContent = `ตกคนละ ${formatCurrency(share)} บาทเอง สบายกระเป๋า (หาร ${count} คน)`;
    } else {
      dom.shareHintText.textContent = `ตกคนละ 0.00 บาท (หาร ${count} คน)`;
    }
  }

  function selectAllConsumers() {
    const dom = getElements();
    const checkboxes = dom.consumerCheckboxGrid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      cb.checked = true;
      cb.closest('.consumer-option').classList.add('selected');
    });
    updatePerPersonSharePreview();
  }

  function clearAllConsumers() {
    const dom = getElements();
    const checkboxes = dom.consumerCheckboxGrid.querySelectorAll('input[type="checkbox"]');
    checkboxes.forEach((cb) => {
      cb.checked = false;
      cb.closest('.consumer-option').classList.remove('selected');
    });
    updatePerPersonSharePreview();
  }

  /**
   * 4. Render logged expenses list (with bill preview button if attached)
   */
  function renderExpensesList(expenses = [], friends = [], onDeleteExpense) {
    const dom = getElements();
    dom.expenseCountTag.textContent = `${expenses.length} บิลแล้ว`;
    dom.expensesListContainer.innerHTML = '';

    if (expenses.length === 0) {
      dom.expensesListContainer.innerHTML = `
        <div class="empty-state">
          <div class="empty-icon">${Icons.get('receipt')}</div>
          <div>ยังไม่มีบิลเลย ทริปนี้กินลมชมวิวเหรอ? แปะบิลแรกด้านบนได้เลย!</div>
        </div>
      `;
      dom.totalLoggedExpenseText.textContent = `รวมยอดโดนไป 0.00 บาท`;
      return;
    }

    let total = 0;
    expenses.forEach((exp, idx) => {
      total += exp.amount;
      const payer = friends[exp.payerId];
      const payerName = payer ? payer.name : 'ไม่ระบุ';
      const perPerson = exp.consumerIds.length > 0 ? exp.amount / exp.consumerIds.length : 0;
      const categoryIcon = getExpenseCategoryIcon(exp.desc);

      const consumerNames = exp.consumerIds
        .map((cId) => friends[cId]?.name)
        .filter(Boolean)
        .join(', ');

      const hasBillImage = !!exp.billImage;

      const item = document.createElement('div');
      item.className = 'expense-item';
      item.innerHTML = `
        <div class="expense-info-main">
          <div class="expense-icon-badge">${categoryIcon}</div>
          <div class="expense-details-text">
            <span class="expense-name">${escapeHtml(exp.desc)}</span>
            <span class="expense-meta">
              <span>คนเปย์: <strong>${escapeHtml(payerName)}</strong></span>
              <span class="meta-dot">•</span>
              <span>หาร ${exp.consumerIds.length} คน (${escapeHtml(consumerNames)})</span>
            </span>
            ${hasBillImage ? `
              <button type="button" class="btn-view-bill" data-img-index="${idx}">
                ${Icons.get('receipt')}
                <span>ดูรูปบิล</span>
              </button>
            ` : ''}
          </div>
        </div>
        <div class="expense-amount-tag">
          <span class="expense-total-baht">${formatCurrency(exp.amount)} <small>฿</small></span>
          <span class="expense-per-person">คนละ ${formatCurrency(perPerson)} ฿</span>
        </div>
        <button class="btn-delete-expense" title="ลบบิลนี้ทิ้ง" data-index="${idx}">
          ${Icons.get('trash')}
        </button>
      `;

      dom.expensesListContainer.appendChild(item);
    });

    dom.totalLoggedExpenseText.textContent = `รวมยอดโดนไป ${formatCurrency(total)} บาท`;

    // Attach delete events
    dom.expensesListContainer.querySelectorAll('.btn-delete-expense').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-index'), 10);
        if (typeof onDeleteExpense === 'function') onDeleteExpense(idx);
      });
    });

    // Attach view bill image events
    dom.expensesListContainer.querySelectorAll('.btn-view-bill').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        const idx = parseInt(e.currentTarget.getAttribute('data-img-index'), 10);
        const exp = expenses[idx];
        if (exp && exp.billImage) {
          openImageModal(exp.billImage, exp.desc || 'รูปบิล / สลิปโอนเงิน');
        }
      });
    });
  }

  /**
   * Dropzone UI updates for image attachment & OCR
   */
  function setDropzonePreview(imageUrl, statusText, statusType = 'manual') {
    const dom = getElements();
    if (!dom.dropzoneEmpty || !dom.dropzonePreview) return;

    dom.dropzoneEmpty.style.display = 'none';
    dom.dropzonePreview.style.display = 'flex';
    dom.billPreviewImg.src = imageUrl;

    let iconHtml = Icons.get('image');
    if (statusType === 'scanning') {
      iconHtml = Icons.get('scan');
    } else if (statusType === 'success') {
      iconHtml = Icons.get('sparkles');
    }

    dom.ocrStatus.className = `ocr-status ${statusType}`;
    dom.ocrStatus.innerHTML = `${iconHtml} <span>${escapeHtml(statusText)}</span>`;
  }

  function resetDropzonePreview() {
    const dom = getElements();
    if (!dom.dropzoneEmpty || !dom.dropzonePreview) return;

    dom.dropzoneEmpty.style.display = 'flex';
    dom.dropzonePreview.style.display = 'none';
    dom.billPreviewImg.src = '';
    dom.ocrStatus.innerHTML = '';
    if (dom.inputExpenseBill) dom.inputExpenseBill.value = '';
  }

  /**
   * Modal Lightbox for receipt viewing
   */
  function openImageModal(imageUrl, title = 'หลักฐานรูปบิล / สลิปโอนเงิน') {
    const dom = getElements();
    if (!dom.imageModal) return;

    dom.imageModalImg.src = imageUrl;
    dom.imageModalTitle.textContent = title;
    dom.imageModal.classList.add('show');
    document.body.style.overflow = 'hidden';
  }

  function closeImageModal() {
    const dom = getElements();
    if (!dom.imageModal) return;

    dom.imageModal.classList.remove('show');
    document.body.style.overflow = '';
    setTimeout(() => {
      dom.imageModalImg.src = '';
    }, 200);
  }

  /**
   * 5. Render Step 3: Balances & Optimal Transfers
   */
  function renderAllSettlement(friends = [], expenses = [], transfersDone = {}, onToggleTransferDone) {
    const dom = getElements();
    const result = calculateSettlement(friends, expenses);
    const { totalTripAmount, balances, transfers } = result;

    // 1. Stats Bar
    dom.statTotalTripAmount.textContent = `${formatCurrency(totalTripAmount)} ฿`;
    dom.statTotalExpensesCount.textContent = `${expenses.length} บิล`;
    dom.statTotalTransfersCount.textContent = `${transfers.length} ครั้งจบ!`;

    // 2. Personal Balance Summary Cards
    dom.personBalanceContainer.innerHTML = '';
    if (balances.length === 0) {
      dom.personBalanceContainer.innerHTML = `
        <div class="empty-state" style="grid-column: 1 / -1;">
          <div class="empty-icon">${Icons.get('chart')}</div>
          <div>เพิ่มเพื่อนแล้วแปะบิลก่อน ถึงจะรู้ว่าใครรอดใครต้องจ่าย!</div>
        </div>
      `;
    } else {
      balances.forEach((b) => {
        const card = document.createElement('div');
        card.className = 'person-card';

        const friend = friends[b.id];
        const initial = friend ? friend.name.charAt(0).toUpperCase() : '?';
        const color = friend ? friend.color : '#4F46E5';

        let badgeHtml = '';
        if (b.netBalance > 0.01) {
          badgeHtml = `<span class="badge-balance get-back">+${formatCurrency(b.netBalance)} ฿ (รับเงินคืน ชิลๆ)</span>`;
        } else if (b.netBalance < -0.01) {
          badgeHtml = `<span class="badge-balance must-pay">-${formatCurrency(Math.abs(b.netBalance))} ฿ (ต้องโอนเพิ่ม อย่าเนียน)</span>`;
        } else {
          badgeHtml = `<span class="badge-balance even">รอดตัว! เจ๊ากันพอดี 0.00 ฿</span>`;
        }

        card.innerHTML = `
          <div class="person-card-left">
            <div class="avatar-circle" style="background-color: ${color};">${initial}</div>
            <div class="person-name-box">
              <span class="person-name">${escapeHtml(b.name)}</span>
              <span class="person-subtext">ออกไป ${formatCurrency(b.paid)} ฿ / ควรจ่าย ${formatCurrency(b.consumed)} ฿</span>
            </div>
          </div>
          <div>${badgeHtml}</div>
        `;

        dom.personBalanceContainer.appendChild(card);
      });
    }

    // 3. Optimal Transfer Cards
    dom.transfersContainer.innerHTML = '';
    if (transfers.length === 0) {
      if (expenses.length > 0) {
        dom.transfersContainer.innerHTML = `
          <div class="empty-state settled-success">
            <div class="empty-icon-success">${Icons.get('checkCircle')}</div>
            <strong>🎉 เคลียร์ครบเป๊ะ ไม่มียอดค้างโอน!</strong>
            <div style="font-size: 13.5px; margin-top: 4px; color: var(--text-muted);">
              ทุกคนจ่ายส่วนของตัวเองครบถ้วน แยกย้ายกลับบ้านได้ สบายใจ
            </div>
          </div>
        `;
      } else {
        dom.transfersContainer.innerHTML = `
          <div class="empty-state">
            <div class="empty-icon">${Icons.get('arrowRightLeft')}</div>
            <div>เมื่อบันทึกบิลแล้ว ระบบจะบอกวิธีโอนที่เจ็บตัวน้อยครั้งที่สุดตรงนี้</div>
          </div>
        `;
      }
    } else {
      transfers.forEach((t, idx) => {
        const transferKey = `${t.fromId}_${t.toId}_${t.amount}`;
        const isDone = !!transfersDone[transferKey];

        const card = document.createElement('div');
        card.className = `transfer-card ${isDone ? 'done' : ''}`;
        card.innerHTML = `
          <div class="transfer-flow">
            <span class="transfer-badge-num">${idx + 1}</span>
            <span class="person-from">${escapeHtml(t.fromName)}</span>
            <span class="transfer-arrow-icon">${Icons.get('arrowRight')}</span>
            <span class="person-to">${escapeHtml(t.toName)}</span>
          </div>
          <div class="transfer-amount-wrap">
            <span class="transfer-amount">${formatCurrency(t.amount)} <small>บาท</small></span>
            <label class="transfer-check-label">
              <input type="checkbox" ${isDone ? 'checked' : ''} data-key="${transferKey}">
              <span>${isDone ? 'โอนแล้วจ้า' : 'รอแป๊บ'}</span>
            </label>
          </div>
        `;

        card.querySelector('input').addEventListener('change', (e) => {
          const checkSpan = card.querySelector('.transfer-check-label span');
          if (checkSpan) checkSpan.textContent = e.target.checked ? 'โอนแล้วจ้า' : 'รอแป๊บ';

          if (typeof onToggleTransferDone === 'function') {
            onToggleTransferDone(transferKey, e.target.checked, t.fromName, t.toName, card);
          }
        });

        dom.transfersContainer.appendChild(card);
      });
    }
  }

  /**
   * 6. Render Debt Simplification Analysis View
   */
  function renderSecretComparisonView(friends = [], expenses = []) {
    const dom = getElements();
    const optResult = calculateSettlement(friends, expenses);
    const rawResult = calculateRawBillTransfers(friends, expenses);

    const rawCount = rawResult.rawTransfers.length;
    const optCount = optResult.transfers.length;
    const savedCount = Math.max(0, rawCount - optCount);
    const percentSaved = rawCount > 0 ? Math.round((savedCount / rawCount) * 100) : 0;

    // 1. Savings Hero Banner
    dom.secretSavingsTitle.textContent = `ประหยัดแรงโอนไปได้ ${savedCount} รอบ (-${percentSaved}%)!`;
    dom.secretSavingsDesc.textContent = `จากเดิมที่ต้องโอนวนไปวนมา ${rawCount} ครั้ง ระบบตัดหนี้ให้เหลือแค่ ${optCount} ครั้ง สบายขึ้นเยอะ!`;
    dom.secretSavingsPill.textContent = `เซฟแรงไป ${percentSaved}%`;

    // 2. Comparison Cards Hero
    dom.secretRawCount.textContent = `${rawCount} รอบ`;
    dom.secretRawSlipCount.textContent = `${rawCount} ใบ`;
    dom.secretRawVolume.textContent = `${formatCurrency(rawResult.rawTotalVolume)} บาท`;
    dom.secretPingPongCount.textContent = `มีคู่ที่โอนเงินสวนทางกัน ${rawResult.mutualPingPongs.length} คู่แน่ะ!`;

    dom.secretOptCount.textContent = `${optCount} รอบจบ`;
    dom.secretOptSlipCount.textContent = `${optCount} ใบ`;
    dom.secretOptVolume.textContent = `${formatCurrency(optResult.totalOptimizedVolume)} บาท`;

    // 3. Mutual Ping-Pongs List
    dom.secretPingPongList.innerHTML = '';
    if (rawResult.mutualPingPongs.length === 0) {
      dom.secretPingPongList.innerHTML = `
        <div class="empty-state-small">
          ไม่พบคู่ที่โอนเงินสวนทางกัน ทริปนี้จ่ายกันเป็นระเบียบดีมาก!
        </div>
      `;
    } else {
      rawResult.mutualPingPongs.forEach((item) => {
        const card = document.createElement('div');
        card.className = 'pingpong-card';
        card.innerHTML = `
          <div class="pingpong-people">
            <span class="person-tag">${escapeHtml(item.personA)}</span>
            <span class="pingpong-icon">${Icons.get('arrowRightLeft')}</span>
            <span class="person-tag">${escapeHtml(item.personB)}</span>
          </div>
          <div class="pingpong-details">
            <strong>${escapeHtml(item.personA)}</strong> ต้องโอนให้ <strong>${escapeHtml(item.personB)}</strong> ${formatCurrency(item.amountAtoB)} ฿ แต่ <strong>${escapeHtml(item.personB)}</strong> ก็ต้องโอนคืน ${formatCurrency(item.amountBtoA)} ฿ (ระบบเลยหักลบเหลือโอนจริงทางเดียวให้เลย ไม่ต้องโอนสวนกัน!)
          </div>
        `;
        dom.secretPingPongList.appendChild(card);
      });
    }

    // 4. Raw Transfers Table
    dom.secretRawTransfersTableBody.innerHTML = '';
    if (rawResult.rawTransfers.length === 0) {
      dom.secretRawTransfersTableBody.innerHTML = `
        <tr>
          <td colspan="6" style="text-align: center; color: var(--text-muted); padding: 24px;">
            ยังไม่มีบิลให้จำลองเลย ไปเพิ่มบิลในหน้าหลักก่อนน้า
          </td>
        </tr>
      `;
    } else {
      rawResult.rawTransfers.forEach((t, i) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
          <td style="font-weight: 500; color: var(--text-muted);">${i + 1}</td>
          <td><strong>${escapeHtml(t.billDesc)}</strong></td>
          <td style="color: var(--danger); font-weight: 500;">${escapeHtml(t.fromName)}</td>
          <td style="color: var(--text-muted); text-align: center;">&rarr;</td>
          <td style="color: var(--success); font-weight: 500;">${escapeHtml(t.toName)}</td>
          <td style="text-align: right; font-weight: 600; font-variant-numeric: tabular-nums;">${formatCurrency(t.amount)} ฿</td>
        </tr>
        `;
        dom.secretRawTransfersTableBody.appendChild(tr);
      });
    }

    // 5. Comparison Table Summary
    dom.tableCompRawRounds.textContent = `${rawCount} ครั้ง (เหนื่อยโอน)`;
    dom.tableCompOptRounds.textContent = `${optCount} ครั้ง (แป๊บเดียวเสร็จ)`;
    dom.tableCompRawSlips.textContent = `${rawCount} สลิป (แชตแตก)`;
    dom.tableCompOptSlips.textContent = `${optCount} สลิป (เช็คง่ายๆ)`;
  }

  function openSecretView(friends, expenses) {
    const dom = getElements();
    dom.mainView.style.display = 'none';
    dom.secretComparisonView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
    renderSecretComparisonView(friends, expenses);
  }

  function backToMainView() {
    const dom = getElements();
    dom.secretComparisonView.style.display = 'none';
    dom.mainView.style.display = 'block';
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  window.SmartSplit.UI = {
    initElements,
    getElements,
    renderFriends,
    updatePayerDropdown,
    renderConsumerCheckboxes,
    getSelectedConsumerIds,
    updatePerPersonSharePreview,
    selectAllConsumers,
    clearAllConsumers,
    renderExpensesList,
    renderAllSettlement,
    renderSecretComparisonView,
    openSecretView,
    backToMainView,
    setDropzonePreview,
    resetDropzonePreview,
    openImageModal,
    closeImageModal
  };
})();
