/**
 * ============================================================================
 * SMART EXPENSE SPLITTER & DEBT MINIMIZER: WEB WORKER PIPELINE (worker.js)
 * ============================================================================
 * Hardware-Sympathetic Principle:
 *   Offloads all compute-intensive Discrete Math, Bitwise SWAR operations,
 *   Graph decomposition, and Greedy Min-Cash-Flow solving to a dedicated OS thread.
 *   Guarantees the Main UI thread maintains an uninterrupted 60/120 FPS pipeline
 *   with zero micro-stutters or input lag during large multi-participant recalculations.
 * ============================================================================
 */

// Import Algorithmic Core
if (typeof ExpenseEngine === 'undefined') {
  try {
    importScripts('engine.js');
  } catch (err) {
    console.error('[Worker] Failed to load engine.js via importScripts:', err);
  }
}

// Instantiate pre-allocated singleton engine instance
const engine = new ExpenseEngine.SettlementEngine();

/**
 * Message Dispatcher
 */
self.onmessage = function (event) {
  const { id, type, payload } = event.data;

  try {
    switch (type) {
      case 'SOLVE': {
        const { participantCount, expenses } = payload;

        // Normalize expenses: convert bitmasks to BigInt
        const normalizedExpenses = expenses.map((exp) => ({
          payer: exp.payer,
          amount: Number(exp.amount),
          mask: typeof exp.mask === 'bigint' ? exp.mask : BigInt(exp.mask || '0')
        }));

        const result = engine.solve(participantCount, normalizedExpenses);
        self.postMessage({ id, type: 'SOLVE_SUCCESS', data: result });
        break;
      }

      case 'BENCHMARK': {
        const { participantCount = 32, expenseCount = 100, iterations = 50 } = payload;
        const benchmarkResult = runBenchmark(participantCount, expenseCount, iterations);
        self.postMessage({ id, type: 'BENCHMARK_SUCCESS', data: benchmarkResult });
        break;
      }

      case 'PING': {
        self.postMessage({ id, type: 'PONG', timestamp: performance.now() });
        break;
      }

      default:
        self.postMessage({ id, type: 'ERROR', error: `Unknown message type: ${type}` });
    }
  } catch (error) {
    self.postMessage({
      id,
      type: 'ERROR',
      error: error.message || 'Execution exception in solver thread',
      stack: error.stack
    });
  }
};

/**
 * Hardware Stress-Test & Micro-Benchmark Runner
 * Generates high-density cyclic transaction graphs and measures solver latency.
 *
 * @param {number} N - Participant count [1..64]
 * @param {number} M - Expense count
 * @param {number} iterations - Warmup and sample passes
 */
function runBenchmark(N, M, iterations) {
  const syntheticExpenses = [];
  const universeMask = ExpenseEngine.setUniverse(N);

  // Generate synthetic multi-party cyclic expenses
  for (let i = 0; i < M; i++) {
    const payer = i % N;
    const amount = Number((15 + (i * 7.35) % 150).toFixed(2));

    // Generate random subset bitmask with at least 2 participants
    let mask = 0n;
    const subsetSize = 2 + (i % Math.min(N, 8));
    for (let s = 0; s < subsetSize; s++) {
      const bit = (i * 3 + s * 5) % N;
      mask |= (1n << BigInt(bit));
    }
    // Always include payer in consumption group for realistic mesh
    mask |= (1n << BigInt(payer));
    mask &= universeMask;

    syntheticExpenses.push({ payer, amount, mask });
  }

  // JIT Warmup
  for (let w = 0; w < 5; w++) {
    engine.solve(N, syntheticExpenses);
  }

  // Execution sampling
  const latenciesUs = new Float64Array(iterations);
  let sampleResult = null;

  for (let it = 0; it < iterations; it++) {
    const t0 = performance.now() * 1000; // Microseconds
    sampleResult = engine.solve(N, syntheticExpenses);
    const t1 = performance.now() * 1000;
    latenciesUs[it] = t1 - t0;
  }

  // Compute statistics
  let sum = 0;
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < iterations; i++) {
    const lat = latenciesUs[i];
    sum += lat;
    if (lat < min) min = lat;
    if (lat > max) max = lat;
  }

  const mean = sum / iterations;
  let variance = 0;
  for (let i = 0; i < iterations; i++) {
    variance += Math.pow(latenciesUs[i] - mean, 2);
  }
  const stdDev = Math.sqrt(variance / iterations);
  const solvesPerSec = Math.round(1_000_000 / mean);

  return {
    participantCount: N,
    expenseCount: M,
    iterations,
    timing: {
      meanUs: Number(mean.toFixed(2)),
      minUs: Number(min.toFixed(2)),
      maxUs: Number(max.toFixed(2)),
      stdDevUs: Number(stdDev.toFixed(2)),
      solvesPerSec
    },
    sampleResult
  };
}
