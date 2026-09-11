/**
 * Everything that knows the shape of Notion's properties. Pure — no I/O — so the awkward part
 * of this integration is testable without a network, and a Notion schema change lands in one file.
 */

// Notion files status options into named groups. The GROUP name is the contract, not the option
// names: a user whose Complete group holds "Shipped" and "Archived" needs no configuration.
const COMPLETE_GROUP = 'Complete';
const TODO_GROUP = 'To-do';
// The alternative for simple setups. A checkbox cannot express "in progress", which is why
// Notion's own task templates use a status property and this is the fallback, not the default.
const CHECKBOX_NAME = 'Done';

export type CompletionProperty =
  | {
      kind: 'status';
      name: string;
      completeOptionIds: string[];
      firstCompleteOptionId: string;
      // Null when the schema has no To-do group, which makes un-completing impossible to express.
      firstTodoOptionId: string | null;
    }
  | { kind: 'checkbox'; name: string };

export interface NotionPage {
  id: string;
  properties: Record<string, unknown>;
}

export interface NotionDataSourceRef {
  id: string;
  name: string;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function groupOptionIds(groups: unknown, groupName: string): string[] {
  if (!Array.isArray(groups)) {
    return [];
  }
  for (const entry of groups) {
    const group = asRecord(entry);
    if (group === null || group.name !== groupName) {
      continue;
    }
    if (!Array.isArray(group.option_ids)) {
      return [];
    }
    return group.option_ids.filter((id): id is string => typeof id === 'string');
  }
  return [];
}

/** One data source is unambiguous; several is a question only the user can answer. */
export function pickDataSource<T extends NotionDataSourceRef>(dataSources: T[]): T | null {
  if (dataSources.length === 1) {
    return dataSources[0];
  }
  return null;
}

/** Status wins over a checkbox when a schema somehow has both — it carries more meaning. */
export function findCompletionProperty(
  properties: Record<string, unknown>
): CompletionProperty | null {
  for (const [name, value] of Object.entries(properties)) {
    const property = asRecord(value);
    if (property === null || property.type !== 'status') {
      continue;
    }
    const status = asRecord(property.status);
    if (status === null) {
      continue;
    }
    const completeOptionIds = groupOptionIds(status.groups, COMPLETE_GROUP);
    if (completeOptionIds.length === 0) {
      continue;
    }
    const todoOptionIds = groupOptionIds(status.groups, TODO_GROUP);
    return {
      kind: 'status',
      name,
      completeOptionIds,
      firstCompleteOptionId: completeOptionIds[0],
      firstTodoOptionId: todoOptionIds.length > 0 ? todoOptionIds[0] : null,
    };
  }
  const checkbox = asRecord(properties[CHECKBOX_NAME]);
  if (checkbox !== null && checkbox.type === 'checkbox') {
    return { kind: 'checkbox', name: CHECKBOX_NAME };
  }
  return null;
}

export function isRowDone(page: NotionPage, property: CompletionProperty): boolean {
  const cell = asRecord(page.properties[property.name]);
  if (cell === null) {
    return false;
  }
  if (property.kind === 'checkbox') {
    return cell.checkbox === true;
  }
  const status = asRecord(cell.status);
  if (status === null || typeof status.id !== 'string') {
    return false;
  }
  return property.completeOptionIds.includes(status.id);
}

/** The title property can carry any name, so it is found by type rather than by key. */
export function rowTitle(page: NotionPage): string {
  for (const value of Object.values(page.properties)) {
    const property = asRecord(value);
    if (property === null || property.type !== 'title' || !Array.isArray(property.title)) {
      continue;
    }
    return property.title
      .map((piece) => {
        const part = asRecord(piece);
        if (part === null || typeof part.plain_text !== 'string') {
          return '';
        }
        return part.plain_text;
      })
      .join('');
  }
  return '';
}
