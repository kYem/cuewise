import { describe, expect, it } from 'vitest';
import {
  asSchemas,
  checkboxSchema,
  noTodoStatusSchema,
  statusSchema,
} from './__fixtures__/notion.fixtures';
import {
  type CompletionProperty,
  completionWrite,
  findCompletionProperty,
  isRowDone,
  type NotionPage,
  type PropertyValues,
  rowTitle,
} from './notion-schema';

function page(properties: Record<string, unknown>): NotionPage {
  return { id: 'pg1', properties: properties as PropertyValues };
}

function statusProperty(schema = statusSchema): CompletionProperty {
  const property = findCompletionProperty(schema);
  if (property === null) {
    throw new Error('the fixture must yield a completion property');
  }
  return property;
}

describe('findCompletionProperty', () => {
  it('ignores a Done property that is not a checkbox', () => {
    expect(
      findCompletionProperty(asSchemas({ Done: { type: 'rich_text', rich_text: {} } }))
    ).toBeNull();
  });

  it('refuses the checkbox fallback when a status property has no readable body', () => {
    expect(
      findCompletionProperty(asSchemas({ Status: { type: 'status' }, ...checkboxSchema }))
    ).toBeNull();
  });

  it('reads completion from the Complete group rather than option names', () => {
    expect(findCompletionProperty(statusSchema)).toEqual({
      kind: 'status',
      name: 'Status',
      completeOptionIds: ['o3', 'o4'],
      todoOptionIds: ['o1'],
    });
  });

  it('accepts a Done checkbox when there is no status property at all', () => {
    expect(findCompletionProperty(checkboxSchema)).toEqual({ kind: 'checkbox', name: 'Done' });
  });

  it('prefers status when a schema carries both', () => {
    expect(findCompletionProperty(asSchemas({ ...statusSchema, ...checkboxSchema }))?.kind).toBe(
      'status'
    );
  });

  it('finds the status property under any name', () => {
    expect(findCompletionProperty(asSchemas({ 'Ship state': statusSchema.Status }))?.name).toBe(
      'Ship state'
    );
  });

  it('refuses a status property with no Complete group', () => {
    const noComplete = asSchemas({
      Status: {
        type: 'status',
        status: {
          options: [{ id: 'o1', name: 'Doing' }],
          groups: [{ id: 'g1', name: 'To-do', option_ids: ['o1'] }],
        },
      },
    });

    expect(findCompletionProperty(noComplete)).toBeNull();
  });

  it('refuses a renamed or localized Complete group even when a Done checkbox exists', () => {
    const localized = asSchemas({
      Statut: {
        type: 'status',
        status: {
          options: [{ id: 'o9', name: 'Fait' }],
          groups: [{ id: 'g9', name: 'Terminé', option_ids: ['o9'] }],
        },
      },
      ...checkboxSchema,
    });

    expect(findCompletionProperty(localized)).toBeNull();
  });

  it('skips a groupless status property to reach a good one later in the schema', () => {
    const skipThenFind = asSchemas({
      Priority: { type: 'status', status: { options: [], groups: [] } },
      ...statusSchema,
    });

    expect(findCompletionProperty(skipThenFind)?.name).toBe('Status');
  });

  it('refuses a Complete group that exists but holds no options', () => {
    const emptyComplete = asSchemas({
      Status: {
        type: 'status',
        status: { options: [], groups: [{ id: 'g3', name: 'Complete', option_ids: [] }] },
      },
    });

    expect(findCompletionProperty(emptyComplete)).toBeNull();
  });

  it('reports an empty To-do list rather than inventing one', () => {
    expect(findCompletionProperty(noTodoStatusSchema)).toMatchObject({ todoOptionIds: [] });
  });

  it('ignores a checkbox under any other name', () => {
    expect(
      findCompletionProperty(asSchemas({ Starred: { type: 'checkbox', checkbox: {} } }))
    ).toBeNull();
  });

  it('returns null for an empty schema', () => {
    expect(findCompletionProperty(asSchemas({}))).toBeNull();
  });

  it('survives a property whose body is not an object', () => {
    expect(findCompletionProperty(asSchemas({ Status: null, Done: 'nope' }))).toBeNull();
  });
});

describe('completionWrite', () => {
  it('writes the first Complete option when completing', () => {
    expect(completionWrite(statusProperty(), true)).toEqual({
      kind: 'status',
      name: 'Status',
      optionId: 'o3',
    });
  });

  it('writes the first To-do option when un-completing', () => {
    expect(completionWrite(statusProperty(), false)).toEqual({
      kind: 'status',
      name: 'Status',
      optionId: 'o1',
    });
  });

  it('yields null for un-completing a table with no To-do group, rather than a cleared status', () => {
    expect(completionWrite(statusProperty(noTodoStatusSchema), false)).toBeNull();
    expect(completionWrite(statusProperty(noTodoStatusSchema), true)).toEqual({
      kind: 'status',
      name: 'Status',
      optionId: 'o3',
    });
  });

  it('writes a boolean for a checkbox', () => {
    expect(completionWrite({ kind: 'checkbox', name: 'Done' }, true)).toEqual({
      kind: 'checkbox',
      name: 'Done',
      checkbox: true,
    });
  });
});

describe('isRowDone', () => {
  it('is done when the option belongs to the Complete group', () => {
    expect(
      isRowDone(page({ Status: { status: { id: 'o4', name: 'Archived' } } }), statusProperty())
    ).toBe(true);
  });

  it('is not done for an in-progress option', () => {
    expect(
      isRowDone(page({ Status: { status: { id: 'o2', name: 'In progress' } } }), statusProperty())
    ).toBe(false);
  });

  it('treats a cleared status as not done', () => {
    expect(isRowDone(page({ Status: { status: null } }), statusProperty())).toBe(false);
  });

  it('treats a missing property as not done rather than throwing', () => {
    expect(isRowDone(page({}), statusProperty())).toBe(false);
  });

  it('reads a checkbox directly', () => {
    expect(isRowDone(page({ Done: { checkbox: true } }), { kind: 'checkbox', name: 'Done' })).toBe(
      true
    );
  });

  it('is done for a Complete-group option whose name does not sound finished', () => {
    const perverse = asSchemas({
      Status: {
        type: 'status',
        status: {
          options: [{ id: 'o9', name: 'Backlog' }],
          groups: [{ id: 'g3', name: 'Complete', option_ids: ['o9'] }],
        },
      },
    });

    expect(
      isRowDone(
        page({ Status: { status: { id: 'o9', name: 'Backlog' } } }),
        statusProperty(perverse)
      )
    ).toBe(true);
  });

  it('is not done for a To-do-group option literally named Done', () => {
    const trap = asSchemas({
      Status: {
        type: 'status',
        status: {
          options: [
            { id: 'o1', name: 'Done' },
            { id: 'o2', name: 'Truly finished' },
          ],
          groups: [
            { id: 'g1', name: 'To-do', option_ids: ['o1'] },
            { id: 'g3', name: 'Complete', option_ids: ['o2'] },
          ],
        },
      },
    });

    expect(
      isRowDone(page({ Status: { status: { id: 'o1', name: 'Done' } } }), statusProperty(trap))
    ).toBe(false);
  });

  it('requires the checkbox to be exactly true, not merely truthy', () => {
    expect(isRowDone(page({ Done: { checkbox: 'yes' } }), { kind: 'checkbox', name: 'Done' })).toBe(
      false
    );
  });
});

describe('rowTitle', () => {
  it('joins the title fragments', () => {
    expect(
      rowTitle(
        page({
          Name: { type: 'title', title: [{ plain_text: 'Ship ' }, { plain_text: 'the thing' }] },
        })
      )
    ).toBe('Ship the thing');
  });

  it('finds the title under any property name', () => {
    expect(rowTitle(page({ Task: { type: 'title', title: [{ plain_text: 'x' }] } }))).toBe('x');
  });

  it('answers an empty string for an empty title rather than throwing', () => {
    expect(rowTitle(page({ Name: { type: 'title', title: [] } }))).toBe('');
  });

  it('answers an empty string when there is no title property at all', () => {
    expect(rowTitle(page({ Done: { checkbox: false } }))).toBe('');
  });
});
