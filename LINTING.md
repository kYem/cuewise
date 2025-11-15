# Linting & Formatting Setup

This project uses **[Biome](https://biomejs.dev/)** for linting and formatting instead of ESLint and Prettier.

## Why Biome?

- ⚡ **50-100x faster** than ESLint
- 🎯 **All-in-one**: Linting + Formatting (replaces both ESLint and Prettier)
- 🔧 **Zero dependencies**: Single Rust binary
- ✅ **Type-aware linting**: Catches type-related issues
- 📱 **Multi-platform**: Works with React, Next.js, AND React Native
- 🚀 **Production-ready**: Actively maintained with great documentation

## Installation

Biome is already installed in the root workspace:

```bash
pnpm add -Dw @biomejs/biome
```

## Configuration

The configuration is in [`biome.json`](./biome.json) at the root of the monorepo.

### Key Features

- **Formatter**:
  - 2-space indentation
  - Single quotes for JavaScript/TypeScript
  - Double quotes for JSX attributes
  - 100-character line width
  - Semicolons always
  - Trailing commas (ES5 style)

- **Linter**:
  - Recommended rules enabled
  - Custom rules for correctness, style, and suspicious code
  - Warns on unused variables, debugger statements, and explicit `any`
  - Auto-organize imports on save

- **VCS Integration**:
  - Uses `.gitignore` for file exclusions
  - Respects version control settings

## Usage

### Command Line

```bash
# Check for linting and formatting issues
pnpm lint

# Auto-fix linting and formatting issues
pnpm lint:fix

# Format code only
pnpm format

# Check formatting only (no fixes)
pnpm format:check
```

### VS Code Integration

#### 1. Install Extension

Install the official Biome extension:

```
Name: Biome
ID: biomejs.biome
```

Or click "Install" when VS Code prompts you (configured in `.vscode/extensions.json`).

#### 2. Automatic Setup

The workspace is pre-configured with `.vscode/settings.json`:

- ✅ Biome as default formatter
- ✅ Format on save enabled
- ✅ Auto-organize imports on save
- ✅ Disables conflicting formatters (ESLint, Prettier)

#### 3. Manual Commands

Open Command Palette (`Cmd+Shift+P` / `Ctrl+Shift+P`):

- **Format Document**: Format current file
- **Organize Imports**: Sort and remove unused imports

### Pre-commit Hooks (Optional)

Add this to your Git pre-commit hook for automatic linting:

```bash
#!/bin/sh
pnpm lint:fix
git add -u
```

## CI/CD Integration

Add to your CI pipeline (GitHub Actions, etc.):

```yaml
- name: Lint and Format Check
  run: pnpm lint
```

This will fail the build if there are unfixed linting or formatting issues.

## Migration from ESLint/Prettier

If you're migrating from an existing project:

```bash
# Migrate ESLint config
npx @biomejs/biome migrate eslint --write

# Migrate Prettier config
npx @biomejs/biome migrate prettier --write
```

## Rules Reference

See all available rules: https://biomejs.dev/linter/rules/

### Currently Enabled Custom Rules

**Correctness:**
- `noUnusedVariables: warn` - Warn about unused variables

**Style:**
- `useConst: error` - Require `const` for never-reassigned variables
- `useTemplate: warn` - Suggest template literals over string concatenation

**Suspicious:**
- `noDebugger: warn` - Warn about `debugger` statements
- `noDoubleEquals: warn` - Warn about `==` usage (prefer `===`)
- `noExplicitAny: warn` - Warn about explicit `any` types

## Multi-Platform Support

Biome works seamlessly across all our platforms:

- ✅ **Browser Extension** (current)
- ✅ **Web App** (future Next.js)
- ✅ **Mobile App** (future React Native)

The same configuration and rules apply to all platforms!

## Troubleshooting

### "Configuration resulted in errors"

Check that all rules in `biome.json` are valid:
```bash
npx @biomejs/biome check --help
```

### VS Code not formatting

1. Ensure Biome extension is installed
2. Check `editor.defaultFormatter` is set to `"biomejs.biome"`
3. Reload VS Code window

### Conflicts with ESLint/Prettier

Remove or disable ESLint and Prettier extensions:
- Uninstall `dbaeumer.vscode-eslint`
- Uninstall `esbenp.prettier-vscode`
- Remove `.eslintrc.*` and `.prettierrc.*` files

## Performance

Biome is **blazing fast**:

```
ESLint + Prettier: ~3-5 seconds
Biome: ~200ms
```

That's a **15-25x speedup** for our monorepo!

## Learn More

- **Official Docs**: https://biomejs.dev/
- **Configuration Reference**: https://biomejs.dev/reference/configuration/
- **Rules Reference**: https://biomejs.dev/linter/rules/
- **VS Code Extension**: https://marketplace.visualstudio.com/items?itemName=biomejs.biome
- **GitHub**: https://github.com/biomejs/biome

## Questions?

For issues or questions about Biome configuration, see:
- Biome Discord: https://biomejs.dev/chat
- Biome GitHub Issues: https://github.com/biomejs/biome/issues
