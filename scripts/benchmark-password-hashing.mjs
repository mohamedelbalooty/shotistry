#!/usr/bin/env node
/**
 * Concurrency & Memory Benchmark for Native Argon2id Password Hashing
 * Measures p50, p95, p99 latency and RSS memory delta across concurrency levels.
 */

import os from 'node:os';
import { performance } from 'node:perf_hooks';
import { hashPassword, verifyPassword } from '../src/lib/auth/password.ts';

function parseArgs() {
  const args = process.argv.slice(2);
  let concurrencyLevels = [1, 4, 8, 16, 25];
  let iterations = 50;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--concurrency' && args[i + 1]) {
      concurrencyLevels = args[i + 1].split(',').map((n) => Number.parseInt(n.trim(), 10));
      i++;
    } else if (args[i] === '--iterations' && args[i + 1]) {
      iterations = Number.parseInt(args[i + 1], 10);
      i++;
    }
  }

  return { concurrencyLevels, iterations };
}

function percentile(sorted, p) {
  if (sorted.length === 0) return 0;
  const index = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, Math.min(index, sorted.length - 1))];
}

async function runBenchmarkForConcurrency(c, iterations) {
  // Force garbage collection if available or settle memory
  if (global.gc) {
    global.gc();
  }

  const initialRss = process.memoryUsage().rss;
  let peakRss = initialRss;

  const latencies = [];
  const samplePassword = 'BenchmarkTestPass2026!';

  // Execute iterations with concurrency pool of size c
  let currentIndex = 0;
  async function worker() {
    while (currentIndex < iterations) {
      currentIndex++;
      const start = performance.now();
      const hash = await hashPassword(samplePassword);
      await verifyPassword(samplePassword, hash);
      const elapsed = performance.now() - start;
      latencies.push(elapsed);

      const currentRss = process.memoryUsage().rss;
      if (currentRss > peakRss) {
        peakRss = currentRss;
      }
    }
  }

  const workers = Array.from({ length: c }, () => worker());
  await Promise.all(workers);

  latencies.sort((a, b) => a - b);
  const p50 = percentile(latencies, 50);
  const p95 = percentile(latencies, 95);
  const p99 = percentile(latencies, 99);
  const mean = latencies.reduce((sum, val) => sum + val, 0) / latencies.length;
  const rssDeltaMiB = Math.max(0, (peakRss - initialRss) / (1024 * 1024));

  return {
    concurrency: c,
    iterations: latencies.length,
    p50: p50.toFixed(2),
    p95: p95.toFixed(2),
    p99: p99.toFixed(2),
    mean: mean.toFixed(2),
    rssDeltaMiB: rssDeltaMiB.toFixed(2),
  };
}

async function main() {
  const { concurrencyLevels, iterations } = parseArgs();

  console.log('='.repeat(78));
  console.log('Shotistry Argon2id Password Hashing Benchmark');
  console.log(`Node: ${process.version} | OS: ${os.type()} ${os.release()} (${os.arch()}) | CPUs: ${os.cpus().length}`);
  console.log(`Iterations per level: ${iterations}`);
  console.log('='.repeat(78));

  // Warmup
  console.log('Warming up hasher...');
  const warmupHash = await hashPassword('Warmup123!');
  await verifyPassword('Warmup123!', warmupHash);

  const results = [];
  for (const c of concurrencyLevels) {
    process.stdout.write(`Benchmarking concurrency c=${c}... `);
    const res = await runBenchmarkForConcurrency(c, iterations);
    results.push(res);
    console.log(`Done. (p50: ${res.p50}ms, p95: ${res.p95}ms, RSS Δ: ${res.rssDeltaMiB} MiB)`);
  }

  console.log('\n### Benchmark Results Summary');
  console.log('| Concurrency (c) | Iterations | p50 (ms) | p95 (ms) | p99 (ms) | Mean (ms) | Peak RSS Δ (MiB) |');
  console.log('|---|---|---|---|---|---|---|');
  for (const r of results) {
    console.log(
      `| ${r.concurrency} | ${r.iterations} | ${r.p50} | ${r.p95} | ${r.p99} | ${r.mean} | ${r.rssDeltaMiB} |`
    );
  }
}

main().catch((err) => {
  console.error('Benchmark failed:', err);
  process.exit(1);
});
