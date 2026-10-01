import { expect, test } from '@playwright/test';

const outside = (page: import('@playwright/test').Page) =>
  page.getByRole('button', { name: 'Toggle theme', exact: true });
const host = (page: import('@playwright/test').Page) =>
  page.getByRole('region', { name: 'Host value' });

test('outside cancellation is optional, discards invalid input and preserves clicked focus', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit root.label', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Edit root.label', exact: true });
  await input.fill('Retain by default');
  await outside(page).click();
  await expect(input).toHaveValue('Retain by default');
  await input.press('Escape');
  await expect(input).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit root.label', exact: true })).toBeFocused();
  await page.getByRole('switch', { name: 'Cancel edit on outside click', exact: true }).check();
  await page.getByRole('button', { name: 'Edit root.quantity', exact: true }).click();
  const number = page.getByRole('textbox', { name: 'Edit root.quantity', exact: true });
  await number.fill('-');
  await outside(page).click();
  await expect(number).toHaveCount(0);
  await expect(outside(page)).toBeFocused();
  await expect(host(page)).toContainText('"quantity": 12');
  await expect(host(page)).toContainText('"label": "Hello"');
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});

test('portaled selection and calendars stay inside; Escape cancels through their key handlers', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('switch', { name: 'Cancel edit on outside click', exact: true }).check();
  await page.getByRole('button', { name: 'Edit root.status', exact: true }).click();
  const status = page.getByRole('combobox', { name: 'Edit root.status', exact: true });
  await status.click();
  expect(
    await page.getByRole('listbox').evaluate((node) => node.closest('[data-json-row]') === null)
  ).toBe(true);
  await page.getByRole('option', { name: 'In review', exact: true }).click();
  await expect(status).toHaveValue('In review');
  await expect(host(page)).toContainText('"status": "Draft"');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('"status": "In review"');
  await page.getByRole('button', { name: 'Edit root.status', exact: true }).click();
  await status.click();
  await status.press('Escape');
  await expect(status).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Edit root.status', exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit root.instant', exact: true }).click();
  await page.locator('.mantine-DateTimePicker-input').click();
  const hours = page.getByRole('spinbutton', { name: 'UTC hours', exact: true });
  await hours.click();
  await expect(hours).toBeVisible();
  expect(await hours.evaluate((node) => node.closest('[data-json-row]') === null)).toBe(true);
  await hours.fill('09');
  await hours.press('Escape');
  await expect(page.locator('.mantine-DateTimePicker-input')).toHaveCount(0);
  await expect(host(page)).toContainText('2026-10-01T12:00:00.123Z');
});

test('structural prompts share outside/Escape cancellation and composition does not cancel', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('switch', { name: 'Cancel edit on outside click', exact: true }).check();
  await page.getByText('Advanced structure controls', { exact: true }).click();
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  const name = page.getByRole('textbox', { name: 'Property name', exact: true });
  await name.fill('discarded');
  await outside(page).click();
  await expect(name).toHaveCount(0);
  await expect(outside(page)).toBeFocused();
  await expect(host(page)).not.toContainText('discarded');
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await name.fill('composing');
  await name.dispatchEvent('keydown', { key: 'Escape', isComposing: true });
  await expect(name).toHaveValue('composing');
  await name.press('Escape');
  await expect(name).toHaveCount(0);
  await expect(page.getByLabel('Structure target', { exact: true })).toBeFocused();
  await page.getByRole('button', { name: 'Edit root.label', exact: true }).click();
  const label = page.getByRole('textbox', { name: 'Edit root.label', exact: true });
  await label.fill('composition buffer');
  await label.dispatchEvent('keydown', { key: 'Escape', isComposing: true });
  await expect(label).toHaveValue('composition buffer');
  await label.press('Escape');
  await expect(label).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo', exact: true })).toBeDisabled();
});
