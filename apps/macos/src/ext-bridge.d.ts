// Runtime bridge to the extension UI, resolved by the Vite `@ext` alias. Typed
// loosely on purpose: this keeps the macOS app's `tsc` from pulling the entire
// extension source into its type-check. Real, fully-typed reuse arrives when the
// pages/stores move into a shared workspace package.
//
// Inline `import('react')` types (no top-level import) keep this a *global*
// ambient file, so the `declare module` blocks register as module declarations.
declare module '@ext/App' {
  const App: import('react').ComponentType;
  export default App;
}

declare module '@ext/components/PomodoroPipProvider' {
  export const PomodoroPipProvider: import('react').ComponentType<{
    children: import('react').ReactNode;
  }>;
}
