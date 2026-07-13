import { expect, test } from '@playwright/test';
import { stubThirdPartyRequests } from './network-stub';

// ENG-57 regression, in the engine it was exclusive to: WebKit doesn't focus
// buttons on mouse click, so the edit row's blur guard saw relatedTarget=null
// and ended editing — unmounting the link picker before its click landed.
test('link-to-goal picker opens from the edit row without closing it (WebKit)', async ({
  page,
}) => {
  await stubThirdPartyRequests(page);
  await page.goto('/');
  await page.getByRole('button', { name: 'Get Started' }).click();

  // Seed an objective plus a linked task for today. The link makes the trigger
  // read "Change linked goal" — unique (the add-row also offers "Link to goal").
  await page.evaluate(() => {
    const today = new Date().toISOString().split('T')[0];
    const createdAt = new Date().toISOString();
    const objective = {
      id: 'obj-1',
      text: 'Ship the release',
      completed: false,
      createdAt,
      date: today,
      type: 'objective',
    };
    const task = {
      id: 'task-1',
      text: 'Write report',
      completed: false,
      createdAt,
      date: today,
      parentId: 'obj-1',
    };
    localStorage.setItem('goals', JSON.stringify([objective, task]));
  });
  await page.reload();

  await page.getByRole('button', { name: 'Write report' }).click();
  const editInput = page.getByRole('textbox', { name: 'Edit task text' });
  await expect(editInput).toHaveValue('Write report');

  // The regression: this click closed the edit row instead of opening the picker.
  await page.getByRole('button', { name: 'Change linked goal' }).click();
  await expect(editInput).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove link' })).toBeVisible();

  // Picking an entry must land too (item mousedown is guarded the same way).
  await page.getByRole('button', { name: 'Remove link' }).click();
  await expect(page.getByRole('button', { name: 'Write report' })).toBeVisible();
  await expect(page.getByTitle('Linked to: Ship the release')).toHaveCount(0);
});
