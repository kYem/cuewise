import type { CaptureDraft } from './capture-draft';

export const CAPTURE_SAVE = 'capture:save';

/** The popup never writes a collection itself: an outside click can close it mid-write. */
export interface CaptureSaveMessage {
  type: typeof CAPTURE_SAVE;
  draft: CaptureDraft;
}

/** `reason` is shown to the user as is. */
export type CaptureSaveResponse = { ok: true } | { ok: false; reason: string };

/** The draft is validated by the handler, so a malformed one still gets a reply. */
export function isCaptureSaveMessage(
  msg: unknown
): msg is { type: typeof CAPTURE_SAVE; draft?: unknown } {
  return (
    typeof msg === 'object' && msg !== null && (msg as { type?: unknown }).type === CAPTURE_SAVE
  );
}
