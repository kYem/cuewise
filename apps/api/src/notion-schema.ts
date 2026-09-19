// Pure property-shape reading, so the schema logic is testable without a network.

// Notion files status options into named groups. The GROUP name is the contract, not the option
// names: a user whose Complete group holds "Shipped" and "Archived" needs no configuration.
const COMPLETE_GROUP = 'Complete';
const TODO_GROUP = 'To-do';
// Fallback for schemas with no status property at all.
const CHECKBOX_NAME = 'Done';

export type CompletionProperty =
  | {
      kind: 'status';
      name: string;
      // Non-empty by construction; [0] is what a write uses.
      completeOptionIds: string[];
      // Empty when the schema has no To-do group, which makes un-completing impossible to express.
      todoOptionIds: string[];
    }
  | { kind: 'checkbox'; name: string };

/** What to PATCH onto a page. Total: a property that cannot express `done` yields null. */
export type CompletionWrite =
  | { kind: 'checkbox'; name: string; checkbox: boolean }
  | { kind: 'status'; name: string; optionId: string };

// A page's property VALUES (`status: {id}`), as opposed to a data source's property SCHEMAS
// (`status: {options, groups}`). Same outer shape, different contents — the brand keeps
// findCompletionProperty from being handed a page by mistake.
export type PropertySchemas = Record<string, unknown> & { readonly __brand: 'PropertySchemas' };
export type PropertyValues = Record<string, unknown> & { readonly __brand: 'PropertyValues' };

export interface NotionPage {
  id: string;
  properties: PropertyValues;
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

/** Joins a Notion rich-text array; anything that is not one reads as empty. */
export function plainText(pieces: unknown): string {
  if (!Array.isArray(pieces)) {
    return '';
  }
  return pieces
    .map((piece) => {
      const part = asRecord(piece);
      if (part === null || typeof part.plain_text !== 'string') {
        return '';
      }
      return part.plain_text;
    })
    .join('');
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

/**
 * A status property always wins, and a status property whose groups do not match refuses rather
 * than falling through: a renamed or localized Complete group would otherwise read completion
 * from an unused checkbox — every task not-done, every write invisible — with no prompt.
 */
export function findCompletionProperty(properties: PropertySchemas): CompletionProperty | null {
  let sawStatus = false;
  for (const [name, value] of Object.entries(properties)) {
    const property = asRecord(value);
    if (property === null || property.type !== 'status') {
      continue;
    }
    sawStatus = true;
    const status = asRecord(property.status);
    if (status === null) {
      continue;
    }
    const completeOptionIds = groupOptionIds(status.groups, COMPLETE_GROUP);
    if (completeOptionIds.length === 0) {
      continue;
    }
    return {
      kind: 'status',
      name,
      completeOptionIds,
      todoOptionIds: groupOptionIds(status.groups, TODO_GROUP),
    };
  }
  if (sawStatus) {
    return null;
  }
  const checkbox = asRecord(properties[CHECKBOX_NAME]);
  if (checkbox !== null && checkbox.type === 'checkbox') {
    return { kind: 'checkbox', name: CHECKBOX_NAME };
  }
  return null;
}

export function completionWrite(
  property: CompletionProperty,
  done: boolean
): CompletionWrite | null {
  if (property.kind === 'checkbox') {
    return { kind: 'checkbox', name: property.name, checkbox: done };
  }
  const optionId = done ? property.completeOptionIds[0] : property.todoOptionIds[0];
  if (optionId === undefined) {
    return null;
  }
  return { kind: 'status', name: property.name, optionId };
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
    return plainText(property.title);
  }
  return '';
}
