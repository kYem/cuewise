# @productivity-extension/ui

Shared UI components package.

## Current Implementation

Currently contains web-based UI components built with:
- React
- Tailwind CSS
- Lucide React icons

## Components

- `Button` - Versatile button component with variants
- `Card` - Card container with header/content sections
- `Badge` - Category/status badges

## Future: Multi-Platform Support

When adding React Native mobile app, consider two approaches:

### Option 1: Separate Packages
```
packages/
  ui-web/         # Web components (Tailwind CSS)
  ui-native/      # React Native components (React Native)
  ui-shared/      # Shared component logic/hooks
```

### Option 2: Conditional Exports
Keep one package with platform-specific exports:
```typescript
// packages/ui/src/index.web.ts
export * from './components/Button.web';

// packages/ui/src/index.native.ts
export * from './components/Button.native';
```

Then use bundler resolution to pick the right version.

### Option 3: Cross-Platform UI Library
Use a library like:
- **Tamagui** - React Native + Web with shared code
- **NativeWind** - Tailwind for React Native
- **Gluestack UI** - Universal component library

## Current Usage

```typescript
import { Button, Card, Badge } from '@productivity-extension/ui';

<Button variant="primary" onClick={handleClick}>
  Click me
</Button>
```
