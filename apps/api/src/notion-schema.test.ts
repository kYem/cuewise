import { describe, expect, it } from 'vitest';
import {
  type CompletionProperty,
  findCompletionProperty,
  isRowDone,
  pickDataSource,
  rowTitle,
} from './notion-schema';

// Mirrors a real Notion task schema: custom Complete sub-statuses, so a name match would fail here.
const statusSchema = {
  Status: {
    id: 'p1',
    type: 'status',
    status: {
      options: [
        { id: 'o1', name: 'Not started', color: 'default' },
        { id: 'o2', name: 'In progress', color: 'blue' },
        { id: 'o3', name: 'Shipped', color: 'green' },
        { id: 'o4', name: 'Archived', color: 'gray' },
      ],
      groups: [
        { id: 'g1', name: 'To-do', color: 'default', option_ids: ['o1'] },
        { id: 'g2', name: 'In progress', color: 'blue', option_ids: ['o2'] },
        { id: 'g3', name: 'Complete', color: 'green', option_ids: ['o3', 'o4'] },
      ],
    },
  },
};

const checkboxSchema = { Done: { id: 'p2', type: 'checkbox', checkbox: {} } };

function statusProperty(): CompletionProperty {
  const property = findCompletionProperty(statusSchema);
  if (property === null) {
    throw new Error('the status fixture must yield a completion property');
  }
  return property;
}

describe('pickDataSource', () => {
  it('selects the only data source without asking', () => {
    expect(pickDataSource([{ id: 'ds1', name: 'Tasks' }])).toEqual({ id: 'ds1', name: 'Tasks' });
  });

  it('returns null for several, so the caller asks which one', () => {
    expect(
      pickDataSource([
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ])
    ).toBeNull();
  });

  it('returns null when the database exposes none', () => {
    expect(pickDataSource([])).toBeNull();
  });
});

describe('findCompletionProperty', () => {
  it('reads completion from the Complete group rather than option names', () => {
    expect(findCompletionProperty(statusSchema)).toEqual({
      kind: 'status',
      name: 'Status',
      completeOptionIds: ['o3', 'o4'],
      firstCompleteOptionId: 'o3',
      firstTodoOptionId: 'o1',
    });
  });

  it('accepts a Done checkbox as the simple alternative', () => {
    expect(findCompletionProperty(checkboxSchema)).toEqual({ kind: 'checkbox', name: 'Done' });
  });

  it('prefers status when a schema carries both', () => {
    expect(findCompletionProperty({ ...statusSchema, ...checkboxSchema })?.kind).toBe('status');
  });

  it('finds the status property under any name', () => {
    const renamed = { 'Ship state': statusSchema.Status };

    expect(findCompletionProperty(renamed)?.name).toBe('Ship state');
  });

  it('rejects a status property with no Complete group', () => {
    const noComplete = {
      Status: {
        id: 'p1',
        type: 'status',
        status: {
          options: [{ id: 'o1', name: 'Doing', color: 'blue' }],
          groups: [{ id: 'g1', name: 'To-do', color: 'default', option_ids: ['o1'] }],
        },
      },
    };

    expect(findCompletionProperty(noComplete)).toBeNull();
  });

  it('rejects a Complete group that exists but holds no options', () => {
    const emptyComplete = {
      Status: {
        id: 'p1',
        type: 'status',
        status: { options: [], groups: [{ id: 'g3', name: 'Complete', option_ids: [] }] },
      },
    };

    expect(findCompletionProperty(emptyComplete)).toBeNull();
  });

  it('reports no To-do group rather than inventing one', () => {
    const noTodo = {
      Status: {
        id: 'p1',
        type: 'status',
        status: {
          options: [{ id: 'o3', name: 'Shipped', color: 'green' }],
          groups: [{ id: 'g3', name: 'Complete', option_ids: ['o3'] }],
        },
      },
    };

    expect(findCompletionProperty(noTodo)).toMatchObject({ firstTodoOptionId: null });
  });

  it('ignores a checkbox under any other name', () => {
    expect(
      findCompletionProperty({ Starred: { id: 'p3', type: 'checkbox', checkbox: {} } })
    ).toBeNull();
  });

  it('returns null for an empty schema', () => {
    expect(findCompletionProperty({})).toBeNull();
  });

  it('survives a property whose body is not an object', () => {
    expect(findCompletionProperty({ Status: null, Done: 'nope' })).toBeNull();
  });
});

describe('isRowDone', () => {
  it('is done when the option belongs to the Complete group', () => {
    const page = {
      id: 'pg1',
      properties: { Status: { type: 'status', status: { id: 'o4', name: 'Archived' } } },
    };

    expect(isRowDone(page, statusProperty())).toBe(true);
  });

  it('is not done for an in-progress option', () => {
    const page = {
      id: 'pg1',
      properties: { Status: { type: 'status', status: { id: 'o2', name: 'In progress' } } },
    };

    expect(isRowDone(page, statusProperty())).toBe(false);
  });

  it('treats a cleared status as not done', () => {
    const page = { id: 'pg1', properties: { Status: { type: 'status', status: null } } };

    expect(isRowDone(page, statusProperty())).toBe(false);
  });

  it('treats a missing property as not done rather than throwing', () => {
    expect(isRowDone({ id: 'pg1', properties: {} }, statusProperty())).toBe(false);
  });

  it('reads a checkbox directly', () => {
    const page = { id: 'pg1', properties: { Done: { type: 'checkbox', checkbox: true } } };

    expect(isRowDone(page, { kind: 'checkbox', name: 'Done' })).toBe(true);
  });

  // These two are the point of the whole design: completion follows the GROUP, so an option's
  // own name must carry no weight. A name-matching implementation passes every other test here.
  it('is done for a Complete-group option whose name does not sound finished', () => {
    const perverse = {
      Status: {
        id: 'p1',
        type: 'status',
        status: {
          options: [{ id: 'o9', name: 'Backlog', color: 'gray' }],
          groups: [{ id: 'g3', name: 'Complete', option_ids: ['o9'] }],
        },
      },
    };
    const property = findCompletionProperty(perverse);
    if (property === null) {
      throw new Error('the perverse fixture must yield a completion property');
    }
    const page = {
      id: 'pg1',
      properties: { Status: { type: 'status', status: { id: 'o9', name: 'Backlog' } } },
    };

    expect(isRowDone(page, property)).toBe(true);
  });

  it('is not done for a To-do-group option literally named Done', () => {
    const trap = {
      Status: {
        id: 'p1',
        type: 'status',
        status: {
          options: [
            { id: 'o1', name: 'Done', color: 'default' },
            { id: 'o2', name: 'Truly finished', color: 'green' },
          ],
          groups: [
            { id: 'g1', name: 'To-do', option_ids: ['o1'] },
            { id: 'g3', name: 'Complete', option_ids: ['o2'] },
          ],
        },
      },
    };
    const property = findCompletionProperty(trap);
    if (property === null) {
      throw new Error('the trap fixture must yield a completion property');
    }
    const page = {
      id: 'pg1',
      properties: { Status: { type: 'status', status: { id: 'o1', name: 'Done' } } },
    };

    expect(isRowDone(page, property)).toBe(false);
  });

  it('requires the checkbox to be exactly true, not merely truthy', () => {
    const page = { id: 'pg1', properties: { Done: { type: 'checkbox', checkbox: 'yes' } } };

    expect(isRowDone(page, { kind: 'checkbox', name: 'Done' })).toBe(false);
  });
});

describe('rowTitle', () => {
  it('joins the title fragments', () => {
    const page = {
      id: 'pg1',
      properties: {
        Name: { type: 'title', title: [{ plain_text: 'Ship ' }, { plain_text: 'the thing' }] },
      },
    };

    expect(rowTitle(page)).toBe('Ship the thing');
  });

  it('finds the title under any property name', () => {
    const page = {
      id: 'pg1',
      properties: { Task: { type: 'title', title: [{ plain_text: 'x' }] } },
    };

    expect(rowTitle(page)).toBe('x');
  });

  it('answers an empty string for an empty title rather than throwing', () => {
    const page = { id: 'pg1', properties: { Name: { type: 'title', title: [] } } };

    expect(rowTitle(page)).toBe('');
  });

  it('answers an empty string when there is no title property at all', () => {
    const page = { id: 'pg1', properties: { Done: { type: 'checkbox', checkbox: false } } };

    expect(rowTitle(page)).toBe('');
  });
});
