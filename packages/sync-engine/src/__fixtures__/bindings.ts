import { vi } from 'vitest';
import type { CollectionBinding } from '../collections';

/** Finds a named binding or fails loudly — avoids a non-null assertion at call sites. */
export function requireBinding(bindings: CollectionBinding[], name: string): CollectionBinding {
  const binding = bindings.find((b) => b.name === name);
  if (binding === undefined) {
    throw new Error(`binding not found: ${name}`);
  }
  return binding;
}

/**
 * Routes `binding`'s batched writes through its `writeOne`, one entity at a time, so a test that
 * stubs `writeOne` decides what a pulled page's write does too.
 */
export function batchThroughWriteOne(binding: CollectionBinding): void {
  vi.spyOn(binding, 'writeMany').mockImplementation(async (entities) => {
    for (const [entityId, entity] of entities) {
      const result = await binding.writeOne(entityId, entity);
      if (!result.success) {
        return result;
      }
    }
    return { success: true };
  });
}

/** A disable landing mid-apply: the flag flips once one write, single or batched, lands via `binding`. */
export function disableAfterFirstWrite(binding: CollectionBinding): { isCancelled: () => boolean } {
  const writeOne = binding.writeOne.bind(binding);
  const writeMany = binding.writeMany.bind(binding);
  let disabled = false;
  vi.spyOn(binding, 'writeOne').mockImplementation(async (entityId, entity) => {
    const result = await writeOne(entityId, entity);
    disabled = true;
    return result;
  });
  vi.spyOn(binding, 'writeMany').mockImplementation(async (entities) => {
    const result = await writeMany(entities);
    disabled = true;
    return result;
  });
  return { isCancelled: () => disabled };
}

/** Lets the read that applies a pulled record through, then fails every later read of `binding`. */
export function failReadsAfterFirst(binding: CollectionBinding): void {
  const readAll = binding.readAll.bind(binding);
  vi.spyOn(binding, 'readAll')
    .mockImplementationOnce(readAll)
    .mockRejectedValue(new Error('storage unavailable'));
}
