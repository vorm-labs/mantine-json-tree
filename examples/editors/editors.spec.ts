import { expect, test } from '@playwright/test';
test('exact decimal, BigInt, date and text have explicit controlled commits', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit root.amount', exact: true }).click();
  const amount = page.getByRole('textbox', { name: 'Edit root.amount', exact: true });
  await amount.fill('999999999999999999.123456789000001');
  await amount.blur();
  await expect(amount).toHaveValue('999999999999999999.123456789000001');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText(
    '999999999999999999.123456789000001'
  );
  await page.getByRole('button', { name: 'Edit root.integer', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Edit root.integer', exact: true })
    .fill('999999999999999999999');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText(
    '999999999999999999999n'
  );
  await page.getByRole('button', { name: 'Edit root.instant', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'Edit root.instant', exact: true })
    .fill('2027-01-01T09:00:00.000Z');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText(
    '2027-01-01T09:00:00.000Z'
  );
  await page.getByRole('button', { name: 'Edit root.label', exact: true }).focus();
  await page.keyboard.press('Enter');
  const label = page.getByRole('textbox', { name: 'Edit root.label', exact: true });
  await label.fill('');
  await label.dispatchEvent('compositionstart');
  await page.keyboard.insertText('日本語 文');
  await label.dispatchEvent('compositionend', { data: '日本語 文' });
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.insertText('X');
  await expect(label).toHaveValue('日本語 X文');
  await page.keyboard.press('Enter');
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText('日本語 X文');
});
test('rejection and access changes retain recoverable drafts; translation and cancellation work', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Refuse changes', exact: true }).click();
  await page.getByRole('button', { name: 'Edit root.integer', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Edit root.integer', exact: true });
  await input.fill('-');
  await page.getByRole('button', { name: 'Finish active edit' }).click();
  await expect(input).toHaveValue('-');
  await expect(page.getByLabel('Edit status')).toContainText('invalid');
  await input.fill('123');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(input).toHaveValue('123');
  await expect(page.getByText('The change was not accepted', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Toggle editing' }).click();
  await expect(input).toHaveValue('123');
  await expect(input).toBeDisabled();
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: 'Annuleren', exact: true }).click();
  await expect(page.getByRole('textbox', { name: /^Edit / })).toHaveCount(0);
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText('9007199254740993n');
});
test('custom color popover keeps focus and does not commit on blur', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit root.color', exact: true }).click();
  const input = page.getByRole('textbox', { name: 'Edit root.color', exact: true });
  await input.click();
  await expect(page.getByRole('slider').first()).toBeVisible();
  await page.getByRole('slider').first().focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('slider').first()).toBeFocused();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText('#336699');
});
