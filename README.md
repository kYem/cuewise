# Productivity & Motivation Browser Extension

A beautiful browser extension that replaces your new tab page with motivational quotes, goals, reminders, and productivity tracking.

## Features

### ✨ Currently Implemented (v1.0)
- **Motivational Quotes**: 60+ curated quotes across 6 categories
  - Inspiration, Learning, Productivity, Mindfulness, Success, Creativity
  - Random quote display on each new tab
  - Favorite/hide quotes functionality
  - View count tracking
- **Beautiful UI**: Clean, minimalist design with smooth animations
- **Live Clock**: Real-time display with personalized greetings
- **Category System**: Color-coded quote categories

### 🚀 Planned Features (Future Updates)
- Daily goals with checkbox tracking
- Reminders with browser notifications
- Pomodoro timer (25/5 minute intervals)
- Insights dashboard with statistics
- Custom quote creation
- Dark mode support

## Tech Stack

### Monorepo Architecture
- **Package Manager**: pnpm with workspaces
- **Build Tool**: Turbo (turborepo) for efficient builds
- **Language**: TypeScript throughout

### Packages
- `packages/extension` - Browser extension (React + Vite)
- `packages/shared` - Shared types, utilities, constants
- `packages/storage` - Chrome Storage API abstraction layer
- `packages/ui` - Shared UI components (Tailwind CSS)

### Technologies
- **Framework**: React 18+ with TypeScript
- **Build**: Vite with @crxjs/vite-plugin
- **UI**: Tailwind CSS + custom components
- **State Management**: Zustand
- **Storage**: Chrome Storage API
- **Target**: Chrome/Edge (Manifest V3)

## Getting Started

### Prerequisites
- Node.js >= 18.0.0
- pnpm >= 8.0.0
- Chrome or Edge browser

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd quote-app
   ```

2. **Install dependencies**
   ```bash
   pnpm install
   ```

3. **Build the extension**
   ```bash
   pnpm --filter @productivity-extension/extension build
   ```

   Or use turbo to build all packages:
   ```bash
   pnpm build
   ```

### Loading the Extension in Chrome

1. **Open Chrome Extensions page**
   - Navigate to `chrome://extensions/`
   - Or: Menu → More Tools → Extensions

2. **Enable Developer Mode**
   - Toggle the "Developer mode" switch in the top right

3. **Load the extension**
   - Click "Load unpacked"
   - Navigate to `packages/extension/dist`
   - Click "Select Folder"

4. **Test it!**
   - Open a new tab (Ctrl+T / Cmd+T)
   - You should see the motivational dashboard with a quote!

## Development

### Start development server
```bash
pnpm --filter @productivity-extension/extension dev
```

This starts Vite in development mode with hot module replacement (HMR). The extension will automatically rebuild when you make changes.

### Build for production
```bash
pnpm build
```

### Type checking
```bash
pnpm type-check
```

### Clean build artifacts
```bash
pnpm clean
```

## Project Structure

```
quote-app/
├── packages/
│   ├── extension/          # Main browser extension
│   │   ├── src/
│   │   │   ├── components/ # React components
│   │   │   ├── stores/     # Zustand stores
│   │   │   ├── data/       # Seed quotes data
│   │   │   ├── manifest.json
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   └── dist/          # Build output (load this in Chrome)
│   │
│   ├── shared/            # Shared TypeScript types & utilities
│   │   └── src/
│   │       ├── types.ts
│   │       ├── constants.ts
│   │       └── utils.ts
│   │
│   ├── storage/           # Chrome Storage API wrappers
│   │   └── src/
│   │       ├── chrome-storage.ts
│   │       └── storage-helpers.ts
│   │
│   └── ui/                # Shared UI components
│       └── src/
│           ├── components/
│           └── lib/
│
├── pnpm-workspace.yaml
├── turbo.json
└── package.json
```

## Usage

### Refreshing Quotes
- Click the "New Quote" button to get a random quote
- The quote automatically updates on each new tab

### Favoriting Quotes
- Click the heart icon to add a quote to favorites
- Click again to remove from favorites

### Hiding Quotes
- Click the eye-off icon to hide a quote you don't want to see
- Hidden quotes won't appear in the random selection

## Customization

### Adding More Quotes

Edit `packages/extension/src/data/seed-quotes.ts` to add new quotes:

```typescript
const NEW_CATEGORY_QUOTES = [
  { text: "Your quote here", author: "Author Name" },
  // Add more quotes...
];
```

### Changing Colors

Edit the Tailwind config in `packages/extension/tailwind.config.js`:

```javascript
colors: {
  primary: {
    // Change these values
    500: '#8b5cf6',
    600: '#7c3aed',
    // ...
  }
}
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

### Future Development Priorities
1. Goals system with daily tracking
2. Reminders with notifications
3. Pomodoro timer integration
4. Insights dashboard
5. Custom quote creation UI
6. Dark mode support
7. Export/import settings

## License

MIT License - see LICENSE file for details

## Troubleshooting

### Extension not loading
- Make sure you selected the `packages/extension/dist` folder
- Check that the build completed successfully
- Try rebuilding: `pnpm --filter @productivity-extension/extension build`

### Quotes not displaying
- Open Chrome DevTools (F12) and check for errors
- Check Chrome Storage: DevTools → Application → Storage → Local Storage

### Build errors
- Clear node_modules: `rm -rf node_modules packages/*/node_modules`
- Reinstall: `pnpm install`
- Rebuild: `pnpm build`

## Support

If you encounter any issues or have suggestions, please open an issue on GitHub.

---

**Enjoy staying motivated and productive!** 🚀
