import { chromium, expect } from '@playwright/test';
import sharp from 'sharp';
import { mkdir } from 'node:fs/promises';
await mkdir('artifacts', { recursive: true });
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const navigate = (name) => page.locator('nav').getByRole('button', { name, exact: true }).click();
const field = (name) => page.locator(`[name="${name}"]`);
const picture = await sharp({
  create: { width: 200, height: 120, channels: 3, background: '#ba603b' },
})
  .png()
  .toBuffer();
const secondPicture = await sharp({
  create: { width: 180, height: 180, channels: 4, background: '#386c57' },
})
  .png()
  .toBuffer();
const upload = async (label, buffer) =>
  page
    .getByLabel(label, { exact: true })
    .setInputFiles({ name: 'test.png', mimeType: 'image/png', buffer });
const save = async () => {
  await page.getByRole('dialog').getByRole('button', { name: 'Save changes', exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
};
try {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3011');
  await field('username').fill('owner');
  await field('password').fill('FudoDemo2026!');
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await page.getByRole('heading', { name: 'Welcome back, Alex.' }).waitFor();
  await navigate('Point of sale');
  const freeTable = page.locator('.table-tile').filter({ hasText: 'Available' }).first();
  await freeTable.click();
  await page.getByRole('button', { name: 'Close empty order', exact: true }).click();
  await expect(page.getByRole('status').filter({ hasText: 'Empty order closed.' })).toBeVisible();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await expect(page.locator('.order-header')).toHaveCount(0);
  await navigate('Menu & deals');
  const itemRow = page
    .locator('tr')
    .filter({ has: page.getByText('Classic smash burger', { exact: true }) });
  await itemRow.getByRole('button', { name: 'Edit item' }).click();
  await upload('Menu item picture', picture);
  await save();
  await expect(itemRow.locator('img')).toBeVisible();
  const firstUrl = await itemRow.locator('img').getAttribute('src');
  await itemRow.getByRole('button', { name: 'Edit item' }).click();
  await upload('Menu item picture', secondPicture);
  await save();
  await expect(itemRow.locator('img')).not.toHaveAttribute('src', firstUrl);
  await navigate('Settings');
  await page.getByRole('button', { name: 'Edit settings', exact: true }).click();
  await upload('Restaurant logo', picture);
  await save();
  await expect(page.locator('.restaurant-logo')).toBeVisible();
  const firstLogo = await page.locator('.restaurant-logo').getAttribute('src');
  await page.getByRole('button', { name: 'Edit settings', exact: true }).click();
  await upload('Restaurant logo', secondPicture);
  await save();
  await expect(page.locator('.restaurant-logo')).not.toHaveAttribute('src', firstLogo);
  const currentLogo = await page.locator('.restaurant-logo').getAttribute('src');
  await navigate('Reports');
  await expect(page.getByRole('heading', { name: 'Deals report', exact: true })).toBeVisible();
  const itemsTable = page
    .locator('.panel')
    .filter({ has: page.getByRole('heading', { name: 'Item-wise sales', exact: true }) });
  await expect(itemsTable.getByText('The lunch duo', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Export deals', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Receipt', exact: true }).first().click();
  await expect(page.locator('.receipt-logo')).toHaveAttribute('src', currentLogo);
  await page.locator('.receipt-logo').evaluate((img) => img.decode());
  await page.emulateMedia({ media: 'print' });
  await expect(page.locator('.receipt-logo')).toBeVisible();
  await page.screenshot({ path: 'artifacts/receipt-logo-print.png' });
  await page.emulateMedia({ media: 'screen' });
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  await navigate('Purchases');
  await page
    .locator('.section-head')
    .getByRole('button', { name: 'Pay supplier', exact: true })
    .click();
  await expect(page.getByRole('dialog', { name: 'Pay supplier', exact: true })).toBeVisible();
  await expect(field('supplierId')).toBeVisible();
  await page.getByRole('button', { name: 'Close dialog', exact: true }).click();
  for (const width of [320, 390, 768, 1024, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    for (const name of [
      'Overview',
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
      await navigate(name);
      await page.locator('.section-head h1').waitFor();
      const overflow = await page.evaluate(() => ({
        viewport: innerWidth,
        document: document.documentElement.scrollWidth,
      }));
      if (overflow.document > overflow.viewport + 1)
        throw new Error(`Overflow at ${width}px on ${name}: ${JSON.stringify(overflow)}`);
      if (name === 'Point of sale' && [390, 768, 1024].includes(width))
        await page.screenshot({ path: `artifacts/pos-${width}.png`, fullPage: true });
    }
  }
  if (errors.length) throw new Error(errors.join('; '));
  console.log(
    'PASS: immediate empty close, menu image replacement, logo replacement/print link, separate reports, supplier payment entry, all screens at 320/390/768/1024/1440 px.',
  );
} catch (e) {
  await page.screenshot({ path: 'artifacts/refinements-failure.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
}
