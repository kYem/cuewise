/** Wire shape of a rejected `#[tauri::command]` (see `src-tauri/src/error.rs`). */
export interface CommandError {
  kind: string;
  message: string;
}

export function isCommandError(error: unknown): error is CommandError {
  return (
    typeof error === 'object' &&
    error !== null &&
    typeof (error as CommandError).kind === 'string' &&
    typeof (error as CommandError).message === 'string'
  );
}
