export type DbDriver = 'postgres' | 'sqlite';

/**
 * Resolves the operational database driver.
 * Returns 'postgres' iff SHOTISTRY_DB_DRIVER === 'postgres', otherwise 'sqlite'.
 */
export function resolveDbDriver(): DbDriver {
  return process.env.SHOTISTRY_DB_DRIVER === 'postgres' ? 'postgres' : 'sqlite';
}
