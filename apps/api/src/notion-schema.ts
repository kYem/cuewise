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
      // [0] is what a write uses.
      completeOptionIds: readonly [string, ...string[]];
      // Empty when the schema has no To-do group, which makes un-completing impossible to express.
      todoOptionIds: readonly string[];
    }
  | { kind: 'checkbox'; name: string };

/** What to PATCH onto a page. */
export type CompletionWrite =
  | { kind: 'checkbox'; name: string; checkbox: boolean }
  | { kind: 'status'; name: string; optionId: string };

// A page's property VALUES (`status: {id}`) and a data source's property SCHEMAS (`status:
// {options, groups}`) share an outer shape; the brand keeps a page out of findCompletionProperty.
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

function statusCompletion(name: string, value: unknown): CompletionProperty | null {
  const status = asRecord(asRecord(value)?.status);
  if (status === null) {
    return null;
  }
  const [first, ...rest] = groupOptionIds(status.groups, COMPLETE_GROUP);
  if (first === undefined) {
    return null;
  }
  return {
    kind: 'status',
    name,
    completeOptionIds: [first, ...rest],
    todoOptionIds: groupOptionIds(status.groups, TODO_GROUP),
  };
}

// A status property whose groups do not match refuses rather than falling through: a renamed
// Complete group would otherwise read completion from an unused checkbox, with no prompt.
// Picks once, at selection; the choice is then stored, so key order never decides it again.
export function findCompletionProperty(properties: PropertySchemas): CompletionProperty | null {
  let sawStatus = false;
  for (const [name, value] of Object.entries(properties)) {
    if (asRecord(value)?.type !== 'status') {
      continue;
    }
    sawStatus = true;
    const found = statusCompletion(name, value);
    if (found !== null) {
      return found;
    }
  }
  if (sawStatus) {
    return null;
  }
  return completionPropertyNamed(properties, CHECKBOX_NAME);
}

/** The stored choice, read from a fresh schema: null once that property is gone or unusable. */
export function completionPropertyNamed(
  properties: PropertySchemas,
  name: string
): CompletionProperty | null {
  const property = asRecord(properties[name]);
  if (property === null) {
    return null;
  }
  if (property.type === 'status') {
    return statusCompletion(name, property);
  }
  if (property.type === 'checkbox' && name === CHECKBOX_NAME) {
    return { kind: 'checkbox', name };
  }
  return null;
}

/** Null for anything that is not exactly what `JSON.stringify` of a CompletionProperty leaves. */
export function parseCompletionProperty(stored: string | null): CompletionProperty | null {
  if (stored === null) {
    return null;
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(stored);
  } catch {
    return null;
  }
  const value = asRecord(parsed);
  if (value === null || typeof value.name !== 'string') {
    return null;
  }
  if (value.kind === 'checkbox') {
    return { kind: 'checkbox', name: value.name };
  }
  const complete = stringArray(value.completeOptionIds);
  const todo = stringArray(value.todoOptionIds);
  const [first, ...rest] = complete ?? [];
  if (value.kind !== 'status' || first === undefined || todo === null) {
    return null;
  }
  return {
    kind: 'status',
    name: value.name,
    completeOptionIds: [first, ...rest],
    todoOptionIds: todo,
  };
}

function stringArray(value: unknown): string[] | null {
  if (!Array.isArray(value) || !value.every((item) => typeof item === 'string')) {
    return null;
  }
  return value;
}

/** Null when the property cannot express not-done: a status with no To-do group. */
export function completionWrite(
  property: CompletionProperty,
  done: boolean
): CompletionWrite | null {
  if (property.kind === 'checkbox') {
    return { kind: 'checkbox', name: property.name, checkbox: done };
  }
  if (done) {
    return { kind: 'status', name: property.name, optionId: property.completeOptionIds[0] };
  }
  const optionId = property.todoOptionIds.at(0);
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
