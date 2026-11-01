/**
 * ============================================================================
 * SMART EXPENSE SPLITTER & DEBT MINIMIZER: ALGORITHMIC CORE (engine.js)
 * ============================================================================
 * Discrete Mathematics Foundations:
 *   1. Set Theory & ALU Bitwise Algebra: U = {0..63}, subsets represented as
 *      64-bit bitmasks (BigInt). Subsets, intersections, unions, differences,
 *      and cardinality (Hamming Weight / POPCNT) computed in O(1) clock cycles.
 *   2. Net Balance Function: f(u) = Total_Paid(u) - Total_Consumed(u).
 *      Partitions V into Debtors (f < 0), Creditors (f > 0), Settled (f = 0).
 *      Invariant: Sum_{u in V} f(u) === 0 (Zero-Sum Conservation).
 *   3. Graph Theory & Greedy Min-Cash-Flow:
 *      Raw transaction network is a directed cyclic multigraph G_raw = (V, E_raw).
 *      Min-Cash-Flow matches max debtor with max creditor sequentially,
 *      collapsing multi-party cycles into a planar DAG G_opt with at most |V|-1 edges.
 *
 * Computer Architecture & Hardware-Sympathetic Design:
 *   - Contiguous TypedArrays (Float64Array, BigUint64Array, Uint8Array).
 *   - Zero dynamic heap object allocations inside the solving loop.
 *   - L1/L2 Cache Locality: The entire working set for 64 participants (~35 KB)
 *     fits completely inside standard 32 KB/48 KB L1d CPU caches.
 *   - Stride-1 sequential memory access patterns for optimal hardware prefetchers.
 * ============================================================================
 */

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else if (typeof define === 'function' && define.amd) {
    define([], factory);
  } else {
    root.ExpenseEngine = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // Architectural Constants
  const MAX_PARTICIPANTS = 64;
  const EPSILON = 1e-4; // Sub-cent floating point tolerance for invariant checking
  const CACHE_LINE_BYTES = 64; // Standard x86_64 / ARM64 cache line size

  /**
   * --------------------------------------------------------------------------
   * 1. ALU BITWISE OPERATIONS & SET THEORY (O(1) HARDWARE INTRINSICS)
   * --------------------------------------------------------------------------
   */

  /**
   * 64-bit Parallel SWAR (SIMD-Within-A-Register) Population Count (Hamming Weight).
   * Emulates hardware POPCNT / CNT instructions in 6 ALU cycles without loops or branch divergence.
   * Computes the cardinality |S| of participant subset bitmask in O(1).
   *
   * @param {bigint} mask - 64-bit unsigned integer bitmask
   * @returns {number} Number of active bits set [0..64]
   */
  function popcnt64(mask) {
    let x = BigInt.asUintN(64, mask);
    // 2-bit field sum: x = (x & 0x55...) + ((x >> 1) & 0x55...)
    x = x - ((x >> 1n) & 0x5555555555555555n);
    // 4-bit field sum: (x & 0x33...) + ((x >> 2) & 0x33...)
    x = (x & 0x3333333333333333n) + ((x >> 2n) & 0x3333333333333333n);
    // 8-bit field sum: (x + (x >> 4)) & 0x0F0F...
    x = (x + (x >> 4n)) & 0x0f0f0f0f0f0f0f0fn;
    // Sum across all 8 bytes into top byte via single 64-bit integer multiplication
    x = (x * 0x0101010101010101n) & 0xffffffffffffffffn;
    return Number(x >> 56n);
  }

  /**
   * Count Trailing Zeros (CTZ) / Find First Set bit index for 64-bit BigInt.
   * Uses Math.clz32 (native V8 JIT CPU instruction mapping to BSR/LZCNT) to isolate
   * the bit position in O(1) clock cycles.
   *
   * @param {bigint} val - 64-bit integer
   * @returns {number} Trailing zero count [0..64]
   */
  function ctz64(val) {
    if (val === 0n) return 64;
    const low32 = Number(BigInt.asUintN(32, val));
    if (low32 !== 0) {
      // Isolate LSB: low32 & -low32. CLZ of isolated bit XOR 31 gives CTZ.
      return Math.clz32(low32 & -low32) ^ 31;
    }
    const high32 = Number(BigInt.asUintN(32, val >> 32n));
    return 32 + (Math.clz32(high32 & -high32) ^ 31);
  }

  /**
   * Extracts set bit indices into a pre-allocated TypedArray buffer.
   * Utilizes Brian Kernighan's LSB clearing bit-twiddle (m & -m) combined with
   * constant-time CTZ. Zero dynamic heap allocations inside inner loop.
   *
   * @param {bigint} mask - 64-bit subset bitmask
   * @param {Uint8Array} outBuffer - Pre-allocated target buffer
   * @returns {number} Number of indices extracted
   */
  function extractBitIndices(mask, outBuffer) {
    let m = BigInt.asUintN(64, mask);
    let count = 0;
    while (m !== 0n) {
      const lsb = m & -m; // Hardware LSB isolation
      outBuffer[count++] = ctz64(lsb);
      m ^= lsb; // Clear LSB
    }
    return count;
  }

  // Set-Theoretic Bitmask Primitives
  function setIntersect(maskA, maskB) {
    return BigInt.asUintN(64, maskA & maskB);
  }

  function setUnion(maskA, maskB) {
    return BigInt.asUintN(64, maskA | maskB);
  }

  function setDifference(maskA, maskB) {
    return BigInt.asUintN(64, maskA & ~maskB);
  }

  function setSymmetricDiff(maskA, maskB) {
    return BigInt.asUintN(64, maskA ^ maskB);
  }

  function setIsMember(mask, participantIndex) {
    if (participantIndex < 0 || participantIndex >= MAX_PARTICIPANTS) return false;
    return (mask & (1n << BigInt(participantIndex))) !== 0n;
  }

  function setAddMember(mask, participantIndex) {
    return BigInt.asUintN(64, mask | (1n << BigInt(participantIndex)));
  }

  function setRemoveMember(mask, participantIndex) {
    return BigInt.asUintN(64, mask & ~(1n << BigInt(participantIndex)));
  }

  function setUniverse(participantCount) {
    if (participantCount <= 0) return 0n;
    if (participantCount >= 64) return 0xffffffffffffffffn;
    return (1n << BigInt(participantCount)) - 1n;
  }

  function formatBitmaskHex(mask) {
    const u64 = BigInt.asUintN(64, mask);
    return '0x' + u64.toString(16).toUpperCase().padStart(16, '0');
  }

  function formatBitmaskBin(mask) {
    const u64 = BigInt.asUintN(64, mask);
    const binStr = u64.toString(2).padStart(64, '0');
    // Group into 8-bit bytes for clean terminal inspection
    return binStr.match(/.{1,8}/g).join(' ');
  }

  /**
   * --------------------------------------------------------------------------
   * 2. HARDWARE-SYMPATHETIC ENGINE CLASS (ZERO-ALLOCATION SOLVER)
   * --------------------------------------------------------------------------
   */
  class SettlementEngine {
    constructor() {
      // Contiguous memory buffers pre-allocated once to avoid GC pauses:
      // Balances: 64 participants * 8 bytes = 512 bytes (8 cache lines)
      this.netBalances = new Float64Array(MAX_PARTICIPANTS);
      this.totalPaid = new Float64Array(MAX_PARTICIPANTS);
      this.totalConsumed = new Float64Array(MAX_PARTICIPANTS);

      // Adjacency Matrix for Raw Directed Graph: 64 * 64 * 8 bytes = 32,768 bytes (32 KB)
      // Exactly fits within a standard L1 Data Cache (32 KB or 48 KB)
      this.rawMatrix = new Float64Array(MAX_PARTICIPANTS * MAX_PARTICIPANTS);

      // Solver working buffers
      this.workingBalances = new Float64Array(MAX_PARTICIPANTS);
      this.debtorIndices = new Uint8Array(MAX_PARTICIPANTS); // 64 bytes = exactly 1 cache line
      this.creditorIndices = new Uint8Array(MAX_PARTICIPANTS); // 64 bytes = exactly 1 cache line

      // Pre-allocated edge list for settlement results (at most V - 1 edges)
      this.settlementFrom = new Uint8Array(MAX_PARTICIPANTS);
      this.settlementTo = new Uint8Array(MAX_PARTICIPANTS);
      this.settlementAmount = new Float64Array(MAX_PARTICIPANTS);

      // Scratch buffer for consumer bit extraction (64 bytes = 1 cache line)
      this.consumerScratch = new Uint8Array(MAX_PARTICIPANTS);

      // Working scratch for cycle detection
      this.visitedColor = new Uint8Array(MAX_PARTICIPANTS);
    }

    /**
     * Resets internal numeric buffers via typed array fast memset (.fill(0)).
     * Avoids re-instantiating arrays and eliminates memory fragmentation.
     */
    resetBuffers() {
      this.netBalances.fill(0);
      this.totalPaid.fill(0);
      this.totalConsumed.fill(0);
      this.rawMatrix.fill(0);
      this.workingBalances.fill(0);
      this.debtorIndices.fill(0);
      this.creditorIndices.fill(0);
      this.settlementFrom.fill(0);
      this.settlementTo.fill(0);
      this.settlementAmount.fill(0);
    }

    /**
     * Ingests expenses, computes net balance function f(u), verifies invariant,
     * builds raw directed debt graph, and executes Greedy Min-Cash-Flow.
     *
     * @param {number} participantCount - Number of active participants [1..64]
     * @param {Array<{payer: number, amount: number, mask: bigint|string}>} expenses
     * @returns {Object} Complete settlement model and telemetry metrics
     */
    solve(participantCount, expenses) {
      const startTimeUs = typeof performance !== 'undefined' ? performance.now() * 1000 : Date.now() * 1000;
      this.resetBuffers();

      const N = Math.min(Math.max(participantCount, 0), MAX_PARTICIPANTS);
      let aluOperationsCount = 0;
      let totalExpenseVolume = 0;

      // ======================================================================
      // STEP 1: PARSE EXPENSES & ACCUMULATE CASH FLOWS
      // ======================================================================
      for (let i = 0; i < expenses.length; i++) {
        const exp = expenses[i];
        const payer = Number(exp.payer);
        const amount = Number(exp.amount);
        const rawMask = typeof exp.mask === 'bigint' ? exp.mask : BigInt(exp.mask);

        // Mask participants strictly to active universe
        const universeMask = setUniverse(N);
        const consumerMask = setIntersect(rawMask, universeMask);
        aluOperationsCount += 2;

        if (payer < 0 || payer >= N || amount <= 0) continue;
        totalExpenseVolume += amount;

        // Card(S): Population count in O(1) ALU cycles
        const consumerCount = popcnt64(consumerMask);
        aluOperationsCount += 6;

        if (consumerCount === 0) continue;

        // Symmetric division per participant
        const splitShare = amount / consumerCount;
        this.totalPaid[payer] += amount;

        // Extract bit indices using hardware LSB isolation
        const extractedCount = extractBitIndices(consumerMask, this.consumerScratch);
        aluOperationsCount += extractedCount * 3;

        for (let j = 0; j < extractedCount; j++) {
          const consumer = this.consumerScratch[j];
          this.totalConsumed[consumer] += splitShare;

          // Directed Edge: Consumer owes Payer
          if (consumer !== payer) {
            // Contiguous 2D stride access: index = consumer * 64 + payer
            this.rawMatrix[consumer * MAX_PARTICIPANTS + payer] += splitShare;
          }
        }
      }

      // ======================================================================
      // STEP 2: NET BALANCE FORMULATION & ZERO-SUM INVARIANT CHECK
      // f(u) = Total_Paid(u) - Total_Consumed(u)
      // ======================================================================
      let rawInvariantSum = 0;
      for (let u = 0; u < N; u++) {
        const net = this.totalPaid[u] - this.totalConsumed[u];
        this.netBalances[u] = net;
        this.workingBalances[u] = net;
        rawInvariantSum += net;
      }

      // Strict Zero-Sum Conservation Invariant: sum(f(u)) === 0.
      // Floating-point division (e.g. $10 / 3) can introduce minute sub-cent epsilon (~1e-15).
      // If discrepancy exists, distribute to the highest creditor/debtor to preserve exact zero.
      if (Math.abs(rawInvariantSum) > 0 && Math.abs(rawInvariantSum) < 0.05) {
        let maxAbsIdx = 0;
        let maxAbsVal = 0;
        for (let u = 0; u < N; u++) {
          const absVal = Math.abs(this.workingBalances[u]);
          if (absVal > maxAbsVal) {
            maxAbsVal = absVal;
            maxAbsIdx = u;
          }
        }
        this.workingBalances[maxAbsIdx] -= rawInvariantSum;
        this.netBalances[maxAbsIdx] -= rawInvariantSum;
      }

      // ======================================================================
      // STEP 3: RAW DIRECTED GRAPH DECOMPOSITION & CYCLE DETECTION
      // Construct bilateral net debt edges and scan for cycles
      // ======================================================================
      const rawEdges = [];
      let rawTotalVolume = 0;

      for (let i = 0; i < N; i++) {
        for (let j = i + 1; j < N; j++) {
          const debt_i_to_j = this.rawMatrix[i * MAX_PARTICIPANTS + j];
          const debt_j_to_i = this.rawMatrix[j * MAX_PARTICIPANTS + i];

          if (debt_i_to_j > 0 || debt_j_to_i > 0) {
            // Bilateral cancellation: net = debt_i_to_j - debt_j_to_i
            const netFlow = debt_i_to_j - debt_j_to_i;
            if (netFlow > EPSILON) {
              rawEdges.push({ from: i, to: j, amount: netFlow });
              rawTotalVolume += netFlow;
            } else if (netFlow < -EPSILON) {
              rawEdges.push({ from: j, to: i, amount: -netFlow });
              rawTotalVolume += -netFlow;
            }
          }
        }
      }

      // Detect cycles in the raw transaction network using DFS color-marking
      const detectedCycles = this.detectCyclesInRawGraph(N, rawEdges);

      // ======================================================================
      // STEP 4: GREEDY MIN-CASH-FLOW ALGORITHM
      // Partition V into Debtors (f < 0) and Creditors (f > 0).
      // Sequentially match argmin(f) with argmax(f), satisfying at least one
      // node per iteration. Terminates in at most |V| - 1 iterations.
      // ======================================================================
      let debtorCount = 0;
      let creditorCount = 0;

      for (let u = 0; u < N; u++) {
        if (this.workingBalances[u] < -EPSILON) {
          this.debtorIndices[debtorCount++] = u;
        } else if (this.workingBalances[u] > EPSILON) {
          this.creditorIndices[creditorCount++] = u;
        }
      }

      let settlementEdgeCount = 0;
      let optimizedTotalVolume = 0;

      while (debtorCount > 0 && creditorCount > 0) {
        // Find maximum debtor: argmin(f(u))
        let maxDebtorIdx = 0;
        let maxDebt = -this.workingBalances[this.debtorIndices[0]];
        for (let d = 1; d < debtorCount; d++) {
          const currentDebt = -this.workingBalances[this.debtorIndices[d]];
          if (currentDebt > maxDebt) {
            maxDebt = currentDebt;
            maxDebtorIdx = d;
          }
        }

        // Find maximum creditor: argmax(f(v))
        let maxCreditorIdx = 0;
        let maxCredit = this.workingBalances[this.creditorIndices[0]];
        for (let c = 1; c < creditorCount; c++) {
          const currentCredit = this.workingBalances[this.creditorIndices[c]];
          if (currentCredit > maxCredit) {
            maxCredit = currentCredit;
            maxCreditorIdx = c;
          }
        }

        const debtorNode = this.debtorIndices[maxDebtorIdx];
        const creditorNode = this.creditorIndices[maxCreditorIdx];

        // Transfer amount is the minimum of debt and credit
        const settleAmount = Math.min(maxDebt, maxCredit);

        if (settleAmount > EPSILON) {
          this.settlementFrom[settlementEdgeCount] = debtorNode;
          this.settlementTo[settlementEdgeCount] = creditorNode;
          this.settlementAmount[settlementEdgeCount] = settleAmount;
          settlementEdgeCount++;
          optimizedTotalVolume += settleAmount;
        }

        // Update balances in-place without dynamic allocations
        this.workingBalances[debtorNode] += settleAmount;
        this.workingBalances[creditorNode] -= settleAmount;

        // If debtor is settled, remove in O(1) by swapping with end
        if (Math.abs(this.workingBalances[debtorNode]) <= EPSILON) {
          this.debtorIndices[maxDebtorIdx] = this.debtorIndices[debtorCount - 1];
          debtorCount--;
        }

        // If creditor is settled, remove in O(1) by swapping with end
        if (Math.abs(this.workingBalances[creditorNode]) <= EPSILON) {
          this.creditorIndices[maxCreditorIdx] = this.creditorIndices[creditorCount - 1];
          creditorCount--;
        }
      }

      const endTimeUs = typeof performance !== 'undefined' ? performance.now() * 1000 : Date.now() * 1000;
      const executionTimeUs = Math.max(0.1, Number((endTimeUs - startTimeUs).toFixed(2)));

      // Pack optimized settlement edges
      const settlementEdges = [];
      for (let e = 0; e < settlementEdgeCount; e++) {
        settlementEdges.push({
          from: this.settlementFrom[e],
          to: this.settlementTo[e],
          amount: Number(this.settlementAmount[e].toFixed(2))
        });
      }

      // Calculate hardware memory metrics
      const totalMemoryBytes =
        this.netBalances.byteLength +
        this.totalPaid.byteLength +
        this.totalConsumed.byteLength +
        this.rawMatrix.byteLength +
        this.workingBalances.byteLength +
        this.debtorIndices.byteLength +
        this.creditorIndices.byteLength +
        this.settlementFrom.byteLength +
        this.settlementTo.byteLength +
        this.settlementAmount.byteLength +
        this.consumerScratch.byteLength +
        this.visitedColor.byteLength;

      const cacheLinesOccupied = Math.ceil(totalMemoryBytes / CACHE_LINE_BYTES);

      const edgeReductionPercent =
        rawEdges.length > 0
          ? Number((((rawEdges.length - settlementEdges.length) / rawEdges.length) * 100).toFixed(1))
          : 0;

      const volumeReductionPercent =
        rawTotalVolume > 0
          ? Number((((rawTotalVolume - optimizedTotalVolume) / rawTotalVolume) * 100).toFixed(1))
          : 0;

      // Extract Net Balances for return payload
      const netBalanceResults = [];
      for (let u = 0; u < N; u++) {
        netBalanceResults.push({
          index: u,
          totalPaid: Number(this.totalPaid[u].toFixed(2)),
          totalConsumed: Number(this.totalConsumed[u].toFixed(2)),
          netBalance: Number(this.netBalances[u].toFixed(2)),
          status:
            this.netBalances[u] > EPSILON
              ? 'CREDITOR'
              : this.netBalances[u] < -EPSILON
              ? 'DEBTOR'
              : 'SETTLED'
        });
      }

      return {
        netBalances: netBalanceResults,
        rawGraph: {
          edgeCount: rawEdges.length,
          totalVolume: Number(rawTotalVolume.toFixed(2)),
          edges: rawEdges.map((e) => ({
            from: e.from,
            to: e.to,
            amount: Number(e.amount.toFixed(2))
          })),
          cyclesDetected: detectedCycles
        },
        optimizedGraph: {
          edgeCount: settlementEdges.length,
          totalVolume: Number(optimizedTotalVolume.toFixed(2)),
          edges: settlementEdges,
          maxAllowedEdges: Math.max(0, N - 1)
        },
        telemetry: {
          executionTimeUs,
          memoryBytes: totalMemoryBytes,
          cacheLines: cacheLinesOccupied,
          edgeReductionPercent,
          volumeReductionPercent,
          invariantSum: Number(rawInvariantSum.toFixed(8)),
          isInvariantConserved: Math.abs(rawInvariantSum) < 0.01,
          aluBitwiseOps: aluOperationsCount,
          totalExpenseVolume: Number(totalExpenseVolume.toFixed(2))
        }
      };
    }

    /**
     * Detects cycles in the raw directed debt graph using 3-color DFS (WHITE=0, GREY=1, BLACK=2).
     *
     * @param {number} N - Number of nodes
     * @param {Array<{from: number, to: number, amount: number}>} edges
     * @returns {Array<Array<number>>} List of detected cycle node paths
     */
    detectCyclesInRawGraph(N, edges) {
      this.visitedColor.fill(0); // 0 = unvisited
      const adj = Array.from({ length: N }, () => []);
      for (let i = 0; i < edges.length; i++) {
        adj[edges[i].from].push(edges[i].to);
      }

      const cycles = [];
      const parentMap = new Int16Array(N).fill(-1);

      const dfs = (u, path) => {
        this.visitedColor[u] = 1; // 1 = visiting (in recursion stack)
        path.push(u);

        for (let i = 0; i < adj[u].length; i++) {
          const v = adj[u][i];
          if (this.visitedColor[v] === 1) {
            // Cycle detected! Extract cycle loop
            const cycleStartIdx = path.indexOf(v);
            if (cycleStartIdx !== -1 && cycles.length < 5) {
              const cyclePath = path.slice(cycleStartIdx);
              cyclePath.push(v);
              cycles.push(cyclePath);
            }
          } else if (this.visitedColor[v] === 0) {
            parentMap[v] = u;
            dfs(v, path);
          }
        }

        path.pop();
        this.visitedColor[u] = 2; // 2 = visited
      };

      for (let i = 0; i < N; i++) {
        if (this.visitedColor[i] === 0) {
          dfs(i, []);
        }
      }

      return cycles;
    }
  }

  // Export static utility functions & class
  return {
    MAX_PARTICIPANTS,
    SettlementEngine,
    popcnt64,
    ctz64,
    extractBitIndices,
    setIntersect,
    setUnion,
    setDifference,
    setSymmetricDiff,
    setIsMember,
    setAddMember,
    setRemoveMember,
    setUniverse,
    formatBitmaskHex,
    formatBitmaskBin
  };
});
