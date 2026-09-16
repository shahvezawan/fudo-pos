import { chromium } from '@playwright/test';
const browser = await chromium.launch({ channel: 'chrome', headless: true });
const context = await browser.newContext({ viewport: { width: 1366, height: 900 } });
const page = await context.newPage();
const name = `QA ${Date.now()}`;
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
const nav = async (label) =>
  page.locator('nav').getByRole('button', { name: label, exact: true }).click();
const field = (name) => page.locator(`[name="${name}"]`);
const submit = async (label = 'Save') => {
  await page.getByRole('dialog').getByRole('button', { name: label, exact: true }).click();
  await page.getByRole('dialog').waitFor({ state: 'hidden' });
};
try {
  await page.goto(process.env.TEST_BASE_URL || 'http://127.0.0.1:3011');
  await field('username').fill('owner');
  await field('password').fill('FudoDemo2026!');
  await page.getByRole('button', { name: 'Sign in to workspace' }).click();
  await page.getByRole('heading', { name: 'Welcome back, Alex.' }).waitFor();
  await nav('Inventory');
  await page.getByRole('button', { name: 'Add stock item', exact: true }).click();
  await field('name').fill(name + ' bottle');
  await field('unit').fill('bottles');
  await submit();
  const stockRow = page.locator('tr').filter({ hasText: name + ' bottle' });
  await stockRow.getByRole('button', { name: 'Adjust / count' }).click();
  await field('quantity').fill('20');
  await field('reason').fill('Browser test opening count');
  await submit();
  await nav('Menu & deals');
  await page.getByRole('button', { name: 'Add menu item' }).click();
  await field('name').fill(name + ' drink');
  await field('category').fill('QA');
  await field('price').fill('1.23');
  await field('stockId').selectOption({ label: name + ' bottle · bottles' });
  await submit('Save changes');
  await page
    .locator('tr')
    .filter({ hasText: name + ' drink' })
    .getByText('PKR 1.23', { exact: true })
    .waitFor();
  await nav('Purchases');
  await page.getByRole('button', { name: 'Add supplier', exact: true }).click();
  await field('name').fill(name + ' supplier');
  await field('phone').fill('000');
  await submit();
  await page.getByRole('button', { name: 'New purchase' }).click();
  await field('supplierId').selectOption({ label: name + ' supplier' });
  await field('reference').fill(name);
  await page
    .getByLabel('Stock item', { exact: true })
    .selectOption({ label: name + ' bottle (bottles)' });
  await page.getByLabel('Purchase quantity', { exact: true }).fill('5');
  await page.getByLabel('Unit cost', { exact: true }).fill('0.42');
  await field('reference').click();
  await submit('Post purchase & receive stock');
  const purchase = page.locator('tr').filter({ has: page.getByText(name, { exact: true }) });
  await purchase.getByText('PKR 2.10', { exact: true }).first().waitFor();
  await page
    .locator('.section-head')
    .getByRole('button', { name: 'Pay supplier', exact: true })
    .click();
  await field('supplierId').selectOption({ label: name + ' supplier' });
  await field('method').selectOption('cash');
  await field('sessionId').selectOption({ index: 1 });
  await submit('Record supplier payment');
  await purchase.getByText('Paid', { exact: true }).waitFor();
  await nav('Expenses');
  await page.getByRole('button', { name: 'Record expense' }).click();
  await field('category').fill(name);
  await field('amount').fill('0.11');
  await field('sessionId').selectOption({ index: 1 });
  await submit();
  await page
    .locator('tr')
    .filter({ hasText: name })
    .getByText('PKR 0.11', { exact: true })
    .waitFor();
  await nav('Inventory');
  const balanceRow = page
    .locator('tr')
    .filter({ has: page.getByText(name + ' bottle', { exact: true }) })
    .first();
  await balanceRow.getByText('25', { exact: true }).waitFor();
  await context.setOffline(true);
  await page.getByText(/Connection interrupted · Changes/).waitFor();
  if (!(await page.getByRole('button', { name: 'Add stock item', exact: true }).isDisabled()))
    throw new Error('Mutations were not disabled offline');
  await context.setOffline(false);
  await page
    .getByText(/Connection interrupted · Changes/)
    .waitFor({ state: 'hidden', timeout: 30000 });
  if (errors.length) throw new Error(errors.join('; '));
  console.log(
    'PASS: stock count, menu price, purchase receipt, supplier payment, expense, inventory balance, offline blocking and reconnect.',
  );
} catch (e) {
  await page.screenshot({ path: 'artifacts/operations-failure.png', fullPage: true });
  throw e;
} finally {
  await browser.close();
}
