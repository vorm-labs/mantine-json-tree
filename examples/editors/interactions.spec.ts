import { expect, test, type Page } from '@playwright/test';
const host = (page: Page) => page.getByRole('region', { name: 'Host value' });
async function menu(page: Page, path: string, action: string) {
  await page.getByRole('button', { name: `Actions ${path}`, exact: true }).click();
  await page.getByRole('menuitem', { name: action, exact: true }).click();
}
async function drag(page: Page, from: number, to: number, release = true) {
  const grip = page.getByRole('button', {
    name: `Drag to reorder root.sections.${from}`,
    exact: true,
  });
  const destination = page.getByRole('button', {
    name: `Actions root.sections.${to}`,
    exact: true,
  });
  await grip.scrollIntoViewIfNeeded();
  const a = (await grip.boundingBox())!;
  const b = (await destination.boundingBox())!;
  await page.mouse.move(a.x + a.width / 2, a.y + a.height / 2);
  await page.mouse.down();
  await page.mouse.move(b.x + b.width / 2, b.y + b.height - 1, { steps: 8 });
  if (release) await page.mouse.up();
}
test('typed basic inputs edit at their rows and preserve invalid numeric buffers', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit root.quantity', exact: true }).click();
  const number = page.getByRole('textbox', { name: 'Edit root.quantity', exact: true });
  await expect(number.locator('xpath=ancestor::*[@data-json-row][1]')).toHaveAttribute(
    'data-json-row',
    '["quantity"]'
  );
  await expect(number).toHaveClass(/mantine-NumberInput-input/);
  await number.fill('-');
  await number.blur();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(number).toHaveValue('-');
  await expect(host(page)).toContainText('"quantity": 12');
  await number.fill('13.5');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('"quantity": 13.5');
  await page.getByRole('button', { name: 'Edit root.enabled', exact: true }).click();
  const toggle = page.getByRole('switch', { name: 'Edit root.enabled', exact: true });
  await toggle.uncheck();
  await expect(host(page)).toContainText('"enabled": true');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('"enabled": false');
  await page.getByRole('button', { name: 'Edit root.notes', exact: true }).click();
  const notes = page.getByRole('textbox', { name: 'Edit root.notes', exact: true });
  await expect(notes).toHaveJSProperty('tagName', 'TEXTAREA');
  await notes.fill('First');
  await notes.press('End');
  await notes.press('Enter');
  await notes.pressSequentially('Second');
  await expect(notes).toHaveValue('First\nSecond');
  await notes.press('Escape');
  await expect(host(page)).toContainText('A page worth reading.');
});
test('explicit calendars and choice controls retain staged values until Apply', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit root.date', exact: true }).click();
  const date = page.getByRole('textbox', { name: 'Edit root.date', exact: true });
  await expect(date).toHaveClass(/mantine-DateInput-input/);
  await date.fill('2026-10-20');
  await date.press('Tab');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('"date": "2026-10-20"');
  await page.getByRole('button', { name: 'Edit root.scheduled', exact: true }).click();
  await page.locator('.mantine-DateTimePicker-input').click();
  await page.getByRole('spinbutton', { name: 'UTC hours', exact: true }).fill('10');
  await page.getByRole('spinbutton', { name: 'UTC hours', exact: true }).press('Tab');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('\"scheduled\": \"2026-10-15T10:30:00Z\"');
  await page.getByRole('button', { name: 'Edit root.status', exact: true }).click();
  const status = page.getByRole('combobox', { name: 'Edit root.status', exact: true });
  await status.click();
  await page.getByRole('option', { name: 'In review', exact: true }).click();
  await expect(host(page)).toContainText('"status": "Draft"');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('"status": "In review"');
  await page.getByRole('button', { name: 'Edit root.tags', exact: true }).click();
  await page.getByRole('combobox', { name: 'Edit root.tags', exact: true }).click();
  await page.getByRole('option', { name: 'Engineering', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('Engineering');
});
test('row menus expose null replacement, rename, add and remove without selecting a path', async ({
  page,
}) => {
  await page.goto('/');
  await menu(page, 'root.empty', 'Replace value');
  await page.getByLabel('Initial value').fill('Now filled');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(host(page)).toContainText('"empty": "Now filled"');
  await menu(page, 'root.empty', 'Rename');
  await page.getByLabel('Property name').fill('caption');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit root.caption', exact: true })).toBeVisible();
  await menu(page, 'root.sections.0', 'Add property');
  await page.getByLabel('Property name').fill('subtitle');
  await page.getByLabel('Initial value').fill('Details');
  await page.getByRole('button', { name: 'Apply structure', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit root.sections.0.subtitle', exact: true })
  ).toBeVisible();
  await menu(page, 'root.caption', 'Remove');
  await expect(host(page)).not.toContainText('caption');
  await menu(page, 'root.date', 'Remove');
  await expect(page.getByRole('alert')).toHaveText('Date is required');
});
test('keyboard and pointer reordering use one accepted move and support undo', async ({ page }) => {
  await page.goto('/');
  const down = page.getByRole('button', { name: 'Move down root.sections.0', exact: true });
  await expect(down).toHaveCount(0);
  await page.getByRole('switch', { name: 'Show reorder buttons', exact: true }).check();
  await down.focus();
  await down.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Edit root.sections.0.title', exact: true })
  ).toHaveText('Features');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page.getByRole('switch', { name: 'Show reorder buttons', exact: true }).uncheck();
  await expect(down).toHaveCount(0);
  await drag(page, 0, 2, false);
  await expect(page.locator('[data-drop-after]')).toHaveCount(1);
  await page.mouse.up();
  await expect(
    page.getByRole('button', { name: 'Edit root.sections.2.title', exact: true })
  ).toHaveText('Introduction');
  await expect(page.getByLabel('Last operation')).toHaveText('array-move');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Edit root.sections.0.title', exact: true })
  ).toHaveText('Introduction');
});
test('cancelled, refused and stale drags cannot replace current data', async ({ page }) => {
  await page.goto('/');
  await drag(page, 0, 2, false);
  await page.keyboard.press('Escape');
  await page.mouse.up();
  await expect(
    page.getByRole('button', { name: 'Edit root.sections.0.title', exact: true })
  ).toHaveText('Introduction');
  await page.getByRole('button', { name: 'Refuse changes', exact: true }).click();
  await drag(page, 0, 2);
  await expect(page.getByRole('alert')).toHaveText('The change was not accepted');
  await expect(
    page.getByRole('button', { name: 'Edit root.sections.0.title', exact: true })
  ).toHaveText('Introduction');
  await drag(page, 0, 2, false);
  await page
    .getByRole('button', { name: 'Replace data', exact: true })
    .evaluate((button: HTMLButtonElement) => button.click());
  await page.mouse.up();
  await expect(host(page)).toContainText('External replacement');
  await expect(host(page)).not.toContainText('Introduction');
});
test('narrow touch pointer movement and read-only controls are usable', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const grip = page.getByRole('button', { name: 'Drag to reorder root.sections.0', exact: true });
  await grip.scrollIntoViewIfNeeded();
  // Dispatch pointer events through the same capture handlers used by touch devices.
  // Keyboard and actual mouse input are exercised independently above.
  const destination = page.getByRole('button', { name: 'Actions root.sections.1', exact: true });
  await destination.scrollIntoViewIfNeeded();
  const b = (await destination.boundingBox())!;
  await grip.evaluate((button) => {
    button.setPointerCapture = () => {};
  });
  await grip.dispatchEvent('pointerdown', { pointerId: 9, pointerType: 'touch', button: 0 });
  await grip.dispatchEvent('pointermove', {
    pointerId: 9,
    pointerType: 'touch',
    clientX: b.x + 5,
    clientY: b.y + b.height - 1,
  });
  await grip.dispatchEvent('pointerup', { pointerId: 9, pointerType: 'touch' });
  await expect(
    page.getByRole('button', { name: 'Edit root.sections.0.title', exact: true })
  ).toHaveText('Features');
  await expect
    .poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth))
    .toBe(true);
  await page.getByRole('button', { name: 'Toggle editing', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Actions root.sections.0', exact: true })
  ).toBeDisabled();
});

test('cross-array drops and hidden drafts preserve the current edit boundary', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 1200 });
  await page.goto('/');
  const grip = page.getByRole('button', { name: 'Drag to reorder root.flags.0', exact: true });
  const destination = page.getByRole('button', { name: 'Actions root.sections.0', exact: true });
  await grip.scrollIntoViewIfNeeded();
  const a = (await grip.boundingBox())!;
  const b = (await destination.boundingBox())!;
  await page.mouse.move(a.x + 5, a.y + 5);
  await page.mouse.down();
  await page.mouse.move(b.x + 5, b.y + 5, { steps: 5 });
  await page.mouse.up();
  await expect(page.getByLabel('Last operation')).toHaveText('');
  await page.getByRole('button', { name: 'Edit root.sections.0.title', exact: true }).click();
  const title = page.getByRole('textbox', { name: 'Edit root.sections.0.title', exact: true });
  await title.fill('Retain this draft');
  await page.getByRole('button', { name: 'Collapse root.sections', exact: true }).click();
  await expect(title).toBeVisible();
  await expect(title).toHaveValue('Retain this draft');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(host(page)).toContainText('Retain this draft');
});
test('calendar invalid text stays recoverable and date-like strings are not inferred', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Edit root.date', exact: true }).click();
  const date = page.getByRole('textbox', { name: 'Edit root.date', exact: true });
  await date.fill('2026-02-30');
  await date.press('Tab');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(date).toHaveValue('2026-02-30');
  await expect(host(page)).toContainText('"date": "2026-10-01"');
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Edit root.label', exact: true }).click();
  const label = page.getByRole('textbox', { name: 'Edit root.label', exact: true });
  await label.fill('2026-10-20');
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await page.getByRole('button', { name: 'Edit root.label', exact: true }).click();
  await expect(label).toHaveClass(/mantine-TextInput-input/);
});

test('whole-value tags use one aligned row and stay searchable and editable', async ({ page }) => {
  await page.goto('/');
  const row = page.locator(`[data-json-row='["tags"]']`);
  const value = page.getByRole('button', { name: 'Edit root.tags', exact: true });
  await expect(value).toHaveText('Design, Content');
  await expect(page.locator(`[data-json-row^='["tags",']`)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Collapse root.tags', exact: true })).toHaveCount(
    0
  );
  const keyBounds = (await row.locator('[data-key="tags"]').boundingBox())!;
  const valueBounds = (await value.boundingBox())!;
  expect(
    Math.abs(keyBounds.y + keyBounds.height / 2 - valueBounds.y - valueBounds.height / 2)
  ).toBeLessThan(3);
  // Ordinary arrays still show their indexed entries.
  await expect(page.getByRole('button', { name: 'Edit root.flags.0', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Search JSON', exact: true }).click();
  await page.getByRole('textbox', { name: 'Search JSON', exact: true }).fill('Design');
  await expect(page.getByRole('button', { name: 'Edit root.flags.0', exact: true })).toHaveCount(0);
  await expect(value).toBeVisible();
  await value.click();
  await page.getByRole('combobox', { name: 'Edit root.tags', exact: true }).click();
  await page.getByRole('option', { name: 'Engineering', exact: true }).click();
  await page.getByRole('button', { name: 'Apply', exact: true }).click();
  await expect(value).toHaveText('Design, Content, Engineering');
  await expect(host(page)).toContainText('Engineering');
});
