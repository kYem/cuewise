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

/** A disable landing mid-apply: the flag flips once one record has been written through `binding`. */
export function disableAfterFirstWrite(binding: CollectionBinding): { isCancelled: () => boolean } {
  const write = binding.writeOne.bind(binding);
  let disabled = false;
  vi.spyOn(binding, 'writeOne').mockImplementation(async (entityId, entity) => {
    const result = await write(entityId, entity);
    disabled = true;
    return result;
  });
  return { isCancelled: () => disabled };
}
