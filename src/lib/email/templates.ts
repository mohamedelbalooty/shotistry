/**
 * Bilingual (ar / en) transactional email templates with strict HTML escaping
 * and token-in-fragment (#token=) URL construction.
 */

export function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function resolveBaseUrl(appBaseUrl?: string): string {
  const url =
    appBaseUrl ??
    process.env.APP_BASE_URL ??
    process.env.NEXT_PUBLIC_APP_URL ??
    'https://app.shotistry.com';
  return url.replace(/\/+$/, '');
}

export interface VerifyEmailTemplateInput {
  name?: string | null;
  targetEmail: string;
  token: string;
  locale?: string;
  appBaseUrl?: string;
}

export function renderVerifyEmailTemplate(input: VerifyEmailTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isAr = input.locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const nameSafe = escapeHtml(input.name ?? (isAr ? 'عميلنا العزيز' : 'Valued Merchant'));
  const link = `${resolveBaseUrl(input.appBaseUrl)}/verify-email#token=${input.token}`;

  const subject = isAr
    ? 'تأكيد بريدك الإلكتروني في شوتيستري | Shotistry'
    : 'Verify your Shotistry account';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div dir="${dir}" style="max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
    <h1 style="color: #f59e0b; font-size: 24px; margin-top: 0;">Shotistry</h1>
    <p style="font-size: 16px; line-height: 1.6;">${isAr ? `مرحباً ${nameSafe}،` : `Hello ${nameSafe},`}</p>
    <p style="font-size: 15px; line-height: 1.6;">
      ${
        isAr
          ? 'شكراً لتسجيلك في منصة شوتيستري للتصوير التجاري بالذكاء الاصطناعي. يرجى تأكيد بريدك الإلكتروني لتفعيل جميع مزايا مساحة العمل والاشتراكات.'
          : 'Thank you for registering on Shotistry. Please verify your email address to unlock full workspace capabilities and subscription plans.'
      }
    </p>
    <div style="margin: 32px 0; text-align: center;">
      <a href="${link}" style="background: #f59e0b; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
        ${isAr ? 'تأكيد البريد الإلكتروني' : 'Verify Email Address'}
      </a>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      ${
        isAr
          ? 'إذا لم تقم بإنشاء حساب في شوتيستري، يمكنك تجاهل هذه الرسالة بأمان.'
          : 'If you did not create a Shotistry account, you can safely ignore this email.'
      }
    </p>
  </div>
</body>
</html>`.trim();

  const text = isAr
    ? `مرحباً ${nameSafe}،\n\nيرجى تأكيد بريدك الإلكتروني عبر الرابط التالي:\n${link}\n\nصلاحية هذا الرابط 30 دقيقة.`
    : `Hello ${nameSafe},\n\nPlease verify your email by visiting:\n${link}\n\nThis link is valid for 30 minutes.`;

  return { subject, html, text };
}

export interface PasswordResetTemplateInput {
  name?: string | null;
  targetEmail: string;
  token: string;
  locale?: string;
  appBaseUrl?: string;
}

export function renderPasswordResetTemplate(input: PasswordResetTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isAr = input.locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const nameSafe = escapeHtml(input.name ?? (isAr ? 'عميلنا العزيز' : 'Valued Merchant'));
  const link = `${resolveBaseUrl(input.appBaseUrl)}/reset-password#token=${input.token}`;

  const subject = isAr
    ? 'إعادة تعيين كلمة المرور في شوتيستري | Shotistry'
    : 'Reset your Shotistry password';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div dir="${dir}" style="max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
    <h1 style="color: #f59e0b; font-size: 24px; margin-top: 0;">Shotistry</h1>
    <p style="font-size: 16px; line-height: 1.6;">${isAr ? `مرحباً ${nameSafe}،` : `Hello ${nameSafe},`}</p>
    <p style="font-size: 15px; line-height: 1.6;">
      ${
        isAr
          ? 'تلقينا طلباً لإعادة تعيين كلمة المرور لحسابك في شوتيستري. اضغط على الزر أدناه لاختيار كلمة مرور جديدة.'
          : 'We received a request to reset your Shotistry account password. Click the button below to choose a new password.'
      }
    </p>
    <div style="margin: 32px 0; text-align: center;">
      <a href="${link}" style="background: #f59e0b; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
        ${isAr ? 'إعادة تعيين كلمة المرور' : 'Reset Password'}
      </a>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      ${
        isAr
          ? 'صلاحية هذا الرابط 15 دقيقة فقط. إذا لم تطلب إعادة التعيين، يمكنك تجاهل هذه الرسالة وسيبقى حسابك آمناً.'
          : 'This link is valid for 15 minutes only. If you did not request this, you can ignore this email and your account remains secure.'
      }
    </p>
  </div>
</body>
</html>`.trim();

  const text = isAr
    ? `مرحباً ${nameSafe}،\n\nلإعادة تعيين كلمة المرور، يرجى زيارة الرابط التالي:\n${link}\n\nصلاحية هذا الرابط 15 دقيقة.`
    : `Hello ${nameSafe},\n\nTo reset your password, please visit:\n${link}\n\nThis link expires in 15 minutes.`;

  return { subject, html, text };
}

export interface PasswordChangedNoticeInput {
  name?: string | null;
  targetEmail: string;
  locale?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
}

export function renderPasswordChangedNoticeTemplate(input: PasswordChangedNoticeInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isAr = input.locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const nameSafe = escapeHtml(input.name ?? (isAr ? 'عميلنا العزيز' : 'Valued Merchant'));

  const subject = isAr
    ? 'تنبيه أمني: تم تغيير كلمة المرور لحسابك | Shotistry'
    : 'Security Alert: Your Shotistry password was changed';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div dir="${dir}" style="max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
    <h1 style="color: #ef4444; font-size: 24px; margin-top: 0;">Shotistry Security</h1>
    <p style="font-size: 16px; line-height: 1.6;">${isAr ? `مرحباً ${nameSafe}،` : `Hello ${nameSafe},`}</p>
    <p style="font-size: 15px; line-height: 1.6;">
      ${
        isAr
          ? 'تم تغيير كلمة المرور الخاصة بحسابك في شوتيستري بنجاح وتم تسجيل الخروج من كافة الأجهزة الأخرى كإجراء أمني.'
          : 'Your Shotistry account password was successfully changed, and all other active sessions were revoked as a security precaution.'
      }
    </p>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      ${
        isAr
          ? 'إذا لم تقم بتنفيذ هذا التغيير بنفسك، يرجى التواصل فوراً مع فريق الدعم الفني لحماية حسابك.'
          : 'If you did not perform this action, please contact support immediately to secure your account.'
      }
    </p>
  </div>
</body>
</html>`.trim();

  const text = isAr
    ? `مرحباً ${nameSafe}،\n\nتم تغيير كلمة المرور لحسابك في شوتيستري بنجاح. إذا لم تكن أنت، يرجى التواصل مع الدعم الفني فوراً.`
    : `Hello ${nameSafe},\n\nYour Shotistry password was changed. If you did not make this change, please contact support immediately.`;

  return { subject, html, text };
}

export interface EmailChangeConfirmInput {
  name?: string | null;
  targetEmail: string;
  token: string;
  locale?: string;
  appBaseUrl?: string;
}

export function renderEmailChangeConfirmTemplate(input: EmailChangeConfirmInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isAr = input.locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const nameSafe = escapeHtml(input.name ?? (isAr ? 'عميلنا العزيز' : 'Valued Merchant'));
  const link = `${resolveBaseUrl(input.appBaseUrl)}/account/confirm-email#token=${input.token}`;

  const subject = isAr
    ? 'تأكيد تغيير عنوان البريد الإلكتروني | Shotistry'
    : 'Confirm your new email address on Shotistry';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div dir="${dir}" style="max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
    <h1 style="color: #f59e0b; font-size: 24px; margin-top: 0;">Shotistry</h1>
    <p style="font-size: 16px; line-height: 1.6;">${isAr ? `مرحباً ${nameSafe}،` : `Hello ${nameSafe},`}</p>
    <p style="font-size: 15px; line-height: 1.6;">
      ${
        isAr
          ? 'تم طلب ربط هذا البريد الإلكتروني بحسابك في شوتيستري. اضغط على الزر أدناه لتأكيد التغيير.'
          : 'A request was made to update your Shotistry account email to this address. Click below to confirm.'
      }
    </p>
    <div style="margin: 32px 0; text-align: center;">
      <a href="${link}" style="background: #f59e0b; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
        ${isAr ? 'تأكيد البريد الجديد' : 'Confirm New Email'}
      </a>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      ${
        isAr
          ? 'صلاحية هذا الرابط 15 دقيقة فقط.'
          : 'This link is valid for 15 minutes only.'
      }
    </p>
  </div>
</body>
</html>`.trim();

  const text = isAr
    ? `مرحباً ${nameSafe}،\n\nلتأكيد بريدك الإلكتروني الجديد في شوتيستري، يرجى زيارة الرابط التالي:\n${link}`
    : `Hello ${nameSafe},\n\nTo confirm your new email address on Shotistry, please visit:\n${link}`;

  return { subject, html, text };
}

export interface EmailChangeNoticeInput {
  name?: string | null;
  currentEmail: string;
  newEmail: string;
  locale?: string;
}

export function renderEmailChangeNoticeTemplate(input: EmailChangeNoticeInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isAr = input.locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const nameSafe = escapeHtml(input.name ?? (isAr ? 'عميلنا العزيز' : 'Valued Merchant'));
  const newEmailSafe = escapeHtml(input.newEmail);

  const subject = isAr
    ? 'تنبيه: تم طلب تغيير البريد الإلكتروني لحسابك | Shotistry'
    : 'Notice: Email change requested for your Shotistry account';

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div dir="${dir}" style="max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
    <h1 style="color: #f59e0b; font-size: 24px; margin-top: 0;">Shotistry</h1>
    <p style="font-size: 16px; line-height: 1.6;">${isAr ? `مرحباً ${nameSafe}،` : `Hello ${nameSafe},`}</p>
    <p style="font-size: 15px; line-height: 1.6;">
      ${
        isAr
          ? `تم طلب تغيير البريد الإلكتروني لحسابك إلى <strong>${newEmailSafe}</strong>. تم إرسال رابط التأكيد إلى العنوان الجديد فقط.`
          : `A request was made to change your account email to <strong>${newEmailSafe}</strong>. A confirmation link was sent to that address.`
      }
    </p>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      ${
        isAr
          ? 'إذا لم تطلب هذا التغيير، يرجى تغيير كلمة المرور فوراً والتواصل مع الدعم الفني.'
          : 'If you did not request this, please change your password immediately and contact support.'
      }
    </p>
  </div>
</body>
</html>`.trim();

  const text = isAr
    ? `مرحباً ${nameSafe}،\n\nتم طلب تغيير البريد الإلكتروني لحسابك إلى: ${input.newEmail}.\nإذا لم تكن أنت، يرجى تغيير كلمة المرور فوراً.`
    : `Hello ${nameSafe},\n\nA request was made to change your account email to: ${input.newEmail}.\nIf this was not you, please change your password immediately.`;

  return { subject, html, text };
}

export interface WorkspaceInviteTemplateInput {
  inviterName?: string | null;
  workspaceName: string;
  role: string;
  invitedEmail: string;
  token: string;
  locale?: string;
  appBaseUrl?: string;
}

export function renderWorkspaceInviteTemplate(input: WorkspaceInviteTemplateInput): {
  subject: string;
  html: string;
  text: string;
} {
  const isAr = input.locale === 'ar';
  const dir = isAr ? 'rtl' : 'ltr';
  const inviterSafe = escapeHtml(input.inviterName ?? (isAr ? 'أحد الأعضاء' : 'A team member'));
  const workspaceSafe = escapeHtml(input.workspaceName);
  const roleSafe = escapeHtml(input.role);
  const link = `${resolveBaseUrl(input.appBaseUrl)}/invites/accept#token=${input.token}`;

  const subject = isAr
    ? `دعوة للانضمام إلى مساحة عمل ${workspaceSafe} | Shotistry`
    : `Invitation to join ${workspaceSafe} on Shotistry`;

  const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="margin: 0; padding: 24px; background: #0f172a; color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
  <div dir="${dir}" style="max-width: 600px; margin: 0 auto; background: #1e293b; padding: 32px; border-radius: 12px; border: 1px solid #334155;">
    <h1 style="color: #f59e0b; font-size: 24px; margin-top: 0;">Shotistry</h1>
    <p style="font-size: 16px; line-height: 1.6;">
      ${
        isAr
          ? `قام <strong>${inviterSafe}</strong> بدعوتك للانضمام إلى مساحة العمل <strong>${workspaceSafe}</strong> بصلاحية (${roleSafe}).`
          : `<strong>${inviterSafe}</strong> invited you to join the <strong>${workspaceSafe}</strong> workspace as (${roleSafe}).`
      }
    </p>
    <div style="margin: 32px 0; text-align: center;">
      <a href="${link}" style="background: #f59e0b; color: #000; padding: 14px 28px; text-decoration: none; border-radius: 8px; font-weight: bold; display: inline-block;">
        ${isAr ? 'قبول الدعوة والانضمام' : 'Accept Invitation'}
      </a>
    </div>
    <p style="font-size: 13px; color: #94a3b8; line-height: 1.5;">
      ${
        isAr
          ? 'صلاحية هذه الدعوة 7 أيام. يجب تأكيد بريدك الإلكتروني لقبول الدعوة.'
          : 'This invitation is valid for 7 days. Your email must be verified to accept.'
      }
    </p>
  </div>
</body>
</html>`.trim();

  const text = isAr
    ? `قام ${input.inviterName ?? 'عضو'} بدعوتك للانضمام إلى مساحة عمل ${input.workspaceName} بصلاحية (${input.role}).\n\nلقبول الدعوة، يرجى زيارة:\n${link}`
    : `${input.inviterName ?? 'A member'} invited you to join ${input.workspaceName} as (${input.role}).\n\nTo accept, visit:\n${link}`;

  return { subject, html, text };
}
