/**
 * Cross-platform PostgreSQL Test Runner for Shotistry CI / Local Gate.
 * Enforces REQUIRE_POSTGRES_TESTS=1 and SHOTISTRY_DB_DRIVER=postgres without shell dependencies.
 */
import { spawn } from 'node:child_process';
import path from 'node:path';

process.env.REQUIRE_POSTGRES_TESTS = '1';
process.env.SHOTISTRY_DB_DRIVER = 'postgres';

const nodeExe = process.execPath;
const args = [
  '--import',
  './tests/helpers/env-guard.mjs',
  '--experimental-strip-types',
  '--test',
  'tests/postgres-auth.test.mjs',
  'tests/postgres-ledger.test.mjs',
];

console.log('Running Shotistry PostgreSQL 16 Integration Gate...');
console.log(`Command: ${nodeExe} ${args.join(' ')}`);

const child = spawn(nodeExe, args, {
  stdio: 'inherit',
  env: {
    ...process.env,
    REQUIRE_POSTGRES_TESTS: '1',
    SHOTISTRY_DB_DRIVER: 'postgres',
  },
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
  } else {
    process.exit(code ?? 1);
  }
});

