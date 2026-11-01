/**
 * ============================================================================
 * SMART SPLIT - CALCULATION & DEBT MINIMIZER SOLVER (js/solver.js)
 * ============================================================================
 * Discrete Mathematics Foundations:
 *   1. Zero-Sum Net Balance Conservation:
 *      f(u) = Total_Paid(u) - Total_Consumed(u), where Sum(f(u)) === 0.
 *   2. Greedy Min-Cash-Flow Matching:
 *      Reduces cyclic multigraph transfers into minimal planar transfers (<= N - 1).
 *   3. Raw Bill-By-Bill Simulator & Mutual Ping-Pong Cycle Detection.
 * ============================================================================
 */

window.SmartSplit = window.SmartSplit || {};

(function () {
  'use strict';

  /**
   * คำนวณยอดคงเหลือสุทธิและจับคู่ลดรอบการโอนเงิน (Greedy Min-Cash-Flow)
   * 
   * @param {Array<{ id: number, name: string }>} friends 
   * @param {Array<{ payerId: number, amount: number, consumerIds: number[] }>} expenses 
   * @returns {{
   *   totalTripAmount: number,
   *   balances: Array<{ id: number, name: string, paid: number, consumed: number, netBalance: number }>,
   *   transfers: Array<{ fromId: number, fromName: string, toId: number, toName: string, amount: number }>,
   *   totalOptimizedVolume: number
   * }}
   */
  function calculateSettlement(friends = [], expenses = []) {
    const N = friends.length;
    if (N === 0) {
      return {
        totalTripAmount: 0,
        balances: [],
        transfers: [],
        totalOptimizedVolume: 0
      };
    }

    const paid = new Float64Array(N);
    const consumed = new Float64Array(N);
    let totalTrip = 0;

    // Process all logged expenses
    expenses.forEach((exp) => {
      const amt = Number(exp.amount) || 0;
      totalTrip += amt;
      if (exp.payerId >= 0 && exp.payerId < N) {
        paid[exp.payerId] += amt;
      }

      const numConsumers = exp.consumerIds.length;
      if (numConsumers > 0) {
        const split = amt / numConsumers;
        exp.consumerIds.forEach((cId) => {
          if (cId >= 0 && cId < N) {
            consumed[cId] += split;
          }
        });
      }
    });

    // Compute net balances and partition into Debtors and Creditors
    const balances = [];
    const debtors = [];
    const creditors = [];

    for (let i = 0; i < N; i++) {
      const p = paid[i];
      const c = consumed[i];
      const net = p - c;
      balances.push({
        id: i,
        name: friends[i]?.name || `คน #${i + 1}`,
        paid: p,
        consumed: c,
        netBalance: net
      });

      if (net < -0.01) {
        debtors.push({ id: i, amount: -net });
      } else if (net > 0.01) {
        creditors.push({ id: i, amount: net });
      }
    }

    // Greedy Min-Cash-Flow matching loop (pairs max debtor with max creditor)
    const transfers = [];
    let totalOptimizedVolume = 0;

    while (debtors.length > 0 && creditors.length > 0) {
      debtors.sort((a, b) => b.amount - a.amount);
      creditors.sort((a, b) => b.amount - a.amount);

      const maxDebtor = debtors[0];
      const maxCreditor = creditors[0];
      const settle = Math.min(maxDebtor.amount, maxCreditor.amount);

      if (settle > 0.01) {
        transfers.push({
          fromId: maxDebtor.id,
          fromName: friends[maxDebtor.id]?.name || `คน #${maxDebtor.id + 1}`,
          toId: maxCreditor.id,
          toName: friends[maxCreditor.id]?.name || `คน #${maxCreditor.id + 1}`,
          amount: Number(settle.toFixed(2))
        });
        totalOptimizedVolume += settle;
      }

      maxDebtor.amount -= settle;
      maxCreditor.amount -= settle;

      if (maxDebtor.amount <= 0.01) debtors.shift();
      if (maxCreditor.amount <= 0.01) creditors.shift();
    }

    return {
      totalTripAmount: totalTrip,
      balances,
      transfers,
      totalOptimizedVolume: Number(totalOptimizedVolume.toFixed(2))
    };
  }

  /**
   * จำลองการโอนบิลต่อบิลถ้าไม่มีระบบตัดหนี้ (Raw Bill-by-Bill Simulator)
   * พร้อมค้นหาการโอนเงินสวนทางกัน (Mutual Ping-Pong Transfers)
   * 
   * @param {Array<{ id: number, name: string }>} friends 
   * @param {Array<{ desc: string, payerId: number, amount: number, consumerIds: number[] }>} expenses 
   * @returns {{
   *   rawTransfers: Array<{ billIndex: number, billDesc: string, fromId: number, fromName: string, toId: number, toName: string, amount: number }>,
   *   rawTotalVolume: number,
   *   mutualPingPongs: Array<{ personA: string, personB: string, amountAtoB: number, amountBtoA: number }>
   * }}
   */
  function calculateRawBillTransfers(friends = [], expenses = []) {
    const rawTransfers = [];

    expenses.forEach((exp, expIdx) => {
      const numConsumers = exp.consumerIds.length;
      if (numConsumers === 0) return;
      const share = exp.amount / numConsumers;

      exp.consumerIds.forEach((cId) => {
        if (cId !== exp.payerId) {
          rawTransfers.push({
            billIndex: expIdx + 1,
            billDesc: exp.desc,
            fromId: cId,
            fromName: friends[cId]?.name || 'ไม่ระบุ',
            toId: exp.payerId,
            toName: friends[exp.payerId]?.name || 'ไม่ระบุ',
            amount: Number(share.toFixed(2))
          });
        }
      });
    });

    // Detect mutual ping-pong transfers (e.g. A pays for B in bill 1, B pays for A in bill 2)
    const pairTransactions = {};
    rawTransfers.forEach((t) => {
      const key = `${t.fromId}->${t.toId}`;
      pairTransactions[key] = (pairTransactions[key] || 0) + t.amount;
    });

    const mutualPingPongs = [];
    const checkedPairs = new Set();
    rawTransfers.forEach((t) => {
      const forwardKey = `${t.fromId}->${t.toId}`;
      const reverseKey = `${t.toId}->${t.fromId}`;
      const pairKey = t.fromId < t.toId ? `${t.fromId}_${t.toId}` : `${t.toId}_${t.fromId}`;

      if (!checkedPairs.has(pairKey) && pairTransactions[forwardKey] && pairTransactions[reverseKey]) {
        checkedPairs.add(pairKey);
        mutualPingPongs.push({
          personA: friends[t.fromId]?.name || 'ไม่ระบุ',
          personB: friends[t.toId]?.name || 'ไม่ระบุ',
          amountAtoB: Number(pairTransactions[forwardKey].toFixed(2)),
          amountBtoA: Number(pairTransactions[reverseKey].toFixed(2))
        });
      }
    });

    const rawTotalVolume = rawTransfers.reduce((sum, t) => sum + t.amount, 0);

    return {
      rawTransfers,
      rawTotalVolume: Number(rawTotalVolume.toFixed(2)),
      mutualPingPongs
    };
  }

  window.SmartSplit.Solver = {
    calculateSettlement,
    calculateRawBillTransfers
  };
})();
