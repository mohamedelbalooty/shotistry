import {
  bootstrapPlatformAdmin,
  rotateAdminPasswordViaCli,
} from '../src/lib/auth/admin-bootstrap.ts';

async function main() {
  const isRotate = process.argv.includes('--rotate-password');
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME;
  const bootstrapSecret = process.env.SHOTISTRY_ADMIN_BOOTSTRAP_SECRET;

  if (!email || !password || !bootstrapSecret) {
    console.error(
      'Missing required environment variables: ADMIN_EMAIL, ADMIN_PASSWORD, SHOTISTRY_ADMIN_BOOTSTRAP_SECRET'
    );
    process.exit(1);
  }

  if (isRotate) {
    const result = await rotateAdminPasswordViaCli({
      email,
      newPassword: password,
      bootstrapSecret,
    });
    console.log(
      JSON.stringify({
        success: true,
        rotated: true,
        userId: result.userId,
        email: result.email,
        role: result.role,
        auditLogId: result.auditLogId,
      })
    );
    return;
  }

  const result = await bootstrapPlatformAdmin({
    email,
    password,
    name,
    bootstrapSecret,
  });

  console.log(
    JSON.stringify({
      success: true,
      userId: result.userId,
      email: result.email,
      role: result.role,
      auditLogId: result.auditLogId,
    })
  );
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
