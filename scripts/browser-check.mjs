import { chromium } from '@playwright/test';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const errors = [];
try {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1050 } });
  const page = await context.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3011');
  await page.getByLabel('Username', { exact: true }).fill('owner');
  await page.getByLabel('Password', { exact: true }).fill('FudoDemo2026!');
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await page.getByRole('heading', { name: 'Welcome back, Alex.' }).waitFor();
  await page.locator('.stat-card').first().waitFor();
  await page.screenshot({ path: 'artifacts/dashboard.png', fullPage: true });
  for (const name of [
    'Point of sale',
    'Kitchen display',
    'Cash drawer',
    'Menu & deals',
    'Inventory',
    'Purchases',
    'Expenses',
    'Reports',
    'Team & access',
    'Settings',
  ]) {
    await page.locator('nav').getByRole('button', { name, exact: true }).click();
    await page.locator('.section-head h1').waitFor();
    if (name === 'Point of sale')
      await page.screenshot({ path: 'artifacts/pos.png', fullPage: true });
    if (name === 'Kitchen display')
      await page.screenshot({ path: 'artifacts/kitchen.png', fullPage: true });
  }
  await page.locator('nav').getByRole('button', { name: 'Point of sale', exact: true }).click();
  await page.getByRole('button', { name: /Table 11/ }).click();
  await page.locator('.order-header h2').filter({ hasText: 'Table 11' }).waitFor();
  await page.getByRole('button', { name: /Drinks Sparkling water/ }).click();
  await page.getByLabel('Preparation notes').fill('Browser verification');
  await page.getByRole('button', { name: 'Add to order', exact: true }).click();
  await page.getByRole('button', { name: 'Send to kitchen', exact: true }).click();
  await page.getByRole('status').filter({ hasText: 'Order sent' }).waitFor();
  await page.getByRole('button', { name: 'Continue to payment' }).click();
  await page.locator('select[name=sessionId]').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Confirm payment', exact: true }).click();
  await page.getByRole('button', { name: 'Print receipt', exact: true }).waitFor();
  await page.locator('nav').getByRole('button', { name: 'Kitchen display', exact: true }).click();
  const ticket = page
    .locator('.ticket')
    .filter({ has: page.getByRole('heading', { name: 'Table 11', exact: true }) })
    .last();
  await ticket.getByText('Browser verification', { exact: true }).waitFor();
  await ticket.getByRole('button', { name: 'Start preparing', exact: true }).click();
  await ticket.getByRole('button', { name: 'Mark ready', exact: true }).click();
  await ticket.getByText('Waiting for collection').waitFor();
  await page.locator('nav').getByRole('button', { name: 'Point of sale', exact: true }).click();
  await page.getByRole('button', { name: /Table 11/ }).click();
  await page.getByRole('button', { name: 'Mark served', exact: true }).click();
  await page.getByRole('button', { name: 'Mark served', exact: true }).waitFor({ state: 'hidden' });
  await page.getByRole('button', { name: 'Print receipt', exact: true }).click();
  await page.locator('#print-receipt').waitFor();
  await page.screenshot({ path: 'artifacts/receipt.png' });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await page.setViewportSize({ width: 390, height: 844 });
  await page.locator('nav').getByRole('button', { name: 'Point of sale', exact: true }).click();
  await page.screenshot({ path: 'artifacts/mobile-pos.png', fullPage: true });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth);
  if (overflow) throw new Error('Mobile document has horizontal overflow.');
  if (errors.length) throw new Error('Browser errors: ' + errors.join('; '));
  console.log(
    'PASS: all screens, order→kitchen→cash payment→served→receipt, mobile overflow, no browser errors.',
  );
} finally {
  await browser.close();
}
