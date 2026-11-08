import { getAuthRepository } from '../../src/lib/db/repositories/auth-repository.ts';

/**
 * Test helper to mark a user email as verified via the real repository.
 */
export async function markEmailVerifiedForTests(userId) {
  const authRepo = getAuthRepository();
  await authRepo.markEmailVerified(userId);
}
