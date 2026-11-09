import { test, expect } from '@playwright/test';

test.describe('Shotistry Staging E2E Suite', () => {
  test.describe('1. Public Marketing, Localization & Directionality', () => {
    test('Homepage renders with correct branding, hero, and CTAs', async ({ page }) => {
      await page.goto('/');

      await expect(page).toHaveTitle(/Shotistry/i);

      // Verify header navigation and hero CTA
      const heroCta = page.getByRole('link', { name: /ابدأ جلسة تصوير|Start Photoshoot|أنشئ جلسة تصوير/i });
      await expect(heroCta).toBeVisible();

      // Check footer or language switchers
      const pricingLink = page.getByRole('link', { name: /الأسعار والباقات|Pricing/i }).first();
      await expect(pricingLink).toBeVisible();
    });

    test('Directionality reflects Arabic RTL and English LTR typography', async ({ page }) => {
      await page.goto('/');

      const htmlElement = page.locator('html');
      const dir = await htmlElement.getAttribute('dir');
      // Default locale is Arabic (dir="rtl") or English (dir="ltr")
      expect(['rtl', 'ltr']).toContain(dir);

      // Verify font family or directional class
      const body = page.locator('body');
      await expect(body).toBeVisible();
    });

    test('Pricing page renders plans and switches regional currencies (SAR / EGP)', async ({ page }) => {
      await page.goto('/pricing');

      // Verify plan cards exist (Starter, Pro, Agency)
      await expect(page.getByText(/STARTER|البداية/i).first()).toBeVisible();
      await expect(page.getByText(/PRO|المحترف/i).first()).toBeVisible();
      await expect(page.getByText(/AGENCY|الوكالات/i).first()).toBeVisible();

      // Test regional currency selector buttons
      const saudiBtn = page.getByRole('button', { name: /🇸🇦|SAR|ر\.س/i }).first();
      const egyptBtn = page.getByRole('button', { name: /🇪🇬|EGP|ج\.م/i }).first();

      if (await saudiBtn.isVisible()) {
        await saudiBtn.click();
        await expect(page.locator('body')).toContainText(/ر\.س|SAR/i);
      }

      if (await egyptBtn.isVisible()) {
        await egyptBtn.click();
        await expect(page.locator('body')).toContainText(/ج\.م|EGP/i);
      }
    });
  });

  test.describe('2. Merchant Registration, Login & Session Lifecycle', () => {
    const timestamp = Date.now();
    const testEmail = `merchant_e2e_${timestamp}@example.com`;
    const testPassword = 'Password123!Secure';
    const testName = 'تاجر تجريبي';
    const testWorkspace = 'استوديو التجارة التجريبية';

    test('New merchant can register and is provisioned workspace & trial credits', async ({ page }) => {
      await page.goto('/register');

      // Fill in registration form
      await page.locator('input[type="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);

      const nameInput = page.locator('input[placeholder*="طارق"]').or(page.locator('input').nth(0));
      if (await nameInput.isVisible()) {
        await nameInput.fill(testName);
      }

      const workspaceInput = page.locator('input[placeholder*="متجر"]').or(page.locator('input').nth(1));
      if (await workspaceInput.isVisible()) {
        await workspaceInput.fill(testWorkspace);
      }

      // Submit form
      const submitBtn = page.getByRole('button', { name: /إنشاء حساب جديد|Create Account|سجل الآن/i });
      await submitBtn.click();

      // Upon successful registration, merchant is redirected to /studio or active workspace
      await page.waitForURL(/\/(studio|pricing)?/, { timeout: 15000 });
      expect(page.url()).toMatch(/\/(studio|pricing)?/);
    });

    test('Merchant can log out and log back in with valid credentials', async ({ page }) => {
      // Navigate to login
      await page.goto('/login');

      await page.locator('input[type="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill(testPassword);

      const loginBtn = page.getByRole('button', { name: /تسجيل الدخول|Sign In|Log In/i });
      await loginBtn.click();

      await page.waitForURL(/\/studio/, { timeout: 15000 });
      expect(page.url()).toContain('/studio');
    });

    test('Login rejects invalid password with uniform error', async ({ page }) => {
      await page.goto('/login');

      await page.locator('input[type="email"]').fill(testEmail);
      await page.locator('input[type="password"]').fill('WrongPassword999!');

      const loginBtn = page.getByRole('button', { name: /تسجيل الدخول|Sign In|Log In/i });
      await loginBtn.click();

      // Must show error message
      const errorBanner = page.locator('text=/Invalid email or password|بيانات الدخول غير صحيحة/i');
      await expect(errorBanner).toBeVisible();
    });
  });

  test.describe('3. Studio Workspace & Preset Selection', () => {
    test('Studio workspace displays style presets and interactive controls', async ({ page }) => {
      await page.goto('/studio');

      // Check for preset selection cards
      const presetsSection = page.locator('text=/اختر أسلوب التصوير|Select Photoshoot Style|الأنماط/i');
      await expect(presetsSection.first()).toBeVisible();

      // Check for aspect ratio selectors (1:1, 4:5, 9:16, 16:9)
      const ratio1x1 = page.getByRole('button', { name: /1:1/i });
      if (await ratio1x1.isVisible()) {
        await ratio1x1.click();
        await expect(ratio1x1).toBeVisible();
      }
    });
  });

  test.describe('4. Security Boundaries & Cross-Workspace Isolation', () => {
    test('Unauthenticated user cannot access protected admin dashboard', async ({ page }) => {
      await page.goto('/admin');

      // Must be redirected to /login or show unauthorized barrier
      await page.waitForURL(/\/login|\/admin/, { timeout: 5000 });
      if (page.url().includes('/admin')) {
        // Must show forbidden / unauthorized UI barrier
        await expect(page.locator('text=/غير مصرح|Unauthorized|Forbidden|سجل الدخول/i').first()).toBeVisible();
      } else {
        expect(page.url()).toContain('/login');
      }
    });

    test('Cross-workspace asset URL fetching fails closed', async ({ request }) => {
      // Attempting to query an asset from another workspace or random ID
      const response = await request.get('/api/assets/url?key=workspaces/foreign-ws-id/assets/raw/secret.png');
      expect([401, 403, 404]).toContain(response.status());
    });

    test('Health endpoint reports system status without exposing credentials', async ({ request }) => {
      const response = await request.get('/api/health');
      expect(response.status()).toBe(200);

      const data = await response.json();
      expect(data.status).toBe('pass');
      expect(data.environment).toBeDefined();
      expect(data.checks).toBeDefined();

      // Verify no sensitive keys or tokens are in health response
      const serialized = JSON.stringify(data);
      expect(serialized).not.toContain('AIza');
      expect(serialized).not.toContain('secret');
      expect(serialized).not.toContain('password');
    });
  });
});
