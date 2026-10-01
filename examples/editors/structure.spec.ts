import { expect, test } from '@playwright/test';
test('object creation, rename and removal have host undo and deterministic target focus', async ({
  page,
}) => {
  await page.goto('/');
  const target = page.getByLabel('Structure target', { exact: true });
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await page.getByLabel('Property name').fill('a.b');
  await page.getByLabel('Value type').selectOption('object');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(target).toHaveValue('["a.b"]');
  await expect(target).toBeFocused();
  await expect(page.getByLabel('Last operation')).toHaveText('property-add');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Property name').fill('__proto__');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(target).toHaveValue('["__proto__"]');
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText('"__proto__": {}');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(target).toHaveValue('[]');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText('"__proto__": {}');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Host value' })).not.toContainText('__proto__');
});
test('array insertion, move and removal are keyboard accessible and reject invalid candidate shape', async ({
  page,
}) => {
  await page.goto('/');
  const target = page.getByLabel('Structure target', { exact: true });
  await target.selectOption('["flags"]');
  await page.getByRole('button', { name: 'Insert entry', exact: true }).click();
  await page.getByLabel('Value type').selectOption('number');
  await page.getByLabel('Initial value').fill('2');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Flags must contain booleans');
  await page.getByLabel('Value type').selectOption('boolean');
  await page.getByLabel('Initial value').fill('true');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(target).toHaveValue('["flags",2]');
  const up = page.getByRole('button', { name: 'Move up', exact: true });
  await up.focus();
  await page.keyboard.press('Enter');
  await expect(target).toHaveValue('["flags",1]');
  await expect(page.getByLabel('Last operation')).toHaveText('array-move');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Host value' })).toContainText(
    '"flags": [\n    true,\n    false\n  ]'
  );
});
test('duplicate keys, required fields, pending leaf edits, search and stale creation targets stay guarded', async ({
  page,
}) => {
  await page.goto('/');
  const target = page.getByLabel('Structure target', { exact: true });
  await target.selectOption('["date"]');
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Date is required');
  await target.selectOption('[]');
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await page.getByLabel('Property name').fill('date');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText('Enter a valid value');
  await page.getByRole('button', { name: 'Cancel structure', exact: true }).click();
  await page.getByRole('button', { name: 'Edit root.integer', exact: true }).click();
  await page.getByRole('textbox', { name: 'Edit root.integer', exact: true }).fill('-');
  await expect(target).toBeDisabled();
  await page.getByRole('button', { name: 'Finish active edit' }).click();
  await expect(target).toBeDisabled();
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Search JSON', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search JSON' }).fill('no matching node');
  await target.selectOption('[]');
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await page.getByLabel('Property name').fill('new');
  await page.getByRole('button', { name: 'Replace data', exact: true }).click();
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'The target changed. Cancel this prompt and select it again.'
  );
  await expect(page.getByRole('region', { name: 'Host value' })).not.toContainText('"new"');
});
test('renames preserve expansion and filtering while localized prompts support keyboard cancellation', async ({
  page,
}) => {
  await page.goto('/');
  const target = page.getByLabel('Structure target', { exact: true });
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await page.getByLabel('Property name').fill('nested');
  await page.getByLabel('Value type').selectOption('object');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await page.getByRole('button', { name: 'Add property', exact: true }).click();
  await page.getByLabel('Property name').fill('child');
  await page.getByLabel('Initial value').fill('hello');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await page.getByRole('button', { name: 'Expand root.nested', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit root.nested.child', exact: true })
  ).toBeVisible();
  await target.selectOption('["nested"]');
  await page.getByRole('button', { name: 'Rename', exact: true }).click();
  await page.getByLabel('Property name').fill('renamed');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit root.renamed.child', exact: true })
  ).toBeVisible();
  await page.getByRole('button', { name: 'Search JSON', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search JSON' }).fill('renamed');
  await page.getByRole('button', { name: 'Change language' }).click();
  await page.getByRole('button', { name: 'Eigenschap toevoegen', exact: true }).click();
  const name = page.getByLabel('Eigenschapsnaam');
  await name.fill('temporary');
  await name.press('Escape');
  await expect(page.getByRole('region', { name: 'Host value' })).not.toContainText('temporary');
  await expect(page.getByRole('textbox', { name: 'Search JSON' })).toHaveValue('renamed');
});
