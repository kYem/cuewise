# Productivity & Motivation Platform

A cross-platform productivity suite with motivational quotes, goals, reminders, and productivity tracking. Built as a monorepo supporting browser extensions, web apps, and mobile apps.

## Features

### ✨ Currently Implemented (v1.0)
- **Motivational Quotes**: 60+ curated quotes across 6 categories
  - Inspiration, Learning, Productivity, Mindfulness, Success, Creativity
  - Random quote display on each new tab
  - Favorite/hide quotes functionality
  - View count tracking
- **Custom Quote Creation**: Add your own inspiring quotes
  - Include author, category, source/reference
  - Add personal notes about why quotes are meaningful
  - Source field for book titles, URLs, or references
  - Custom quotes appear alongside curated ones
  - Floating action button for quick access
- **Daily Goals/Todos**: Simple, focused task management
  - Add goals for today with one click
  - Check off completed tasks
  - Progress bar showing completion status
  - Clear completed goals
  - Goals automatically organized by date
- **Beautiful UI**: Clean, minimalist design with smooth animations
- **Live Clock**: Real-time display with personalized greetings
- **Category System**: Color-coded quote categories

### 🚀 Planned Features
**Productivity Features:**
- Reminders with browser notifications
- Pomodoro timer (25/5 minute intervals)
- Insights dashboard with statistics
- Dark mode support

**Platform Expansion:**
- 📱 **Mobile App** (React Native) - Take your productivity on the go
- 🌐 **Web App** (Next.js) - Access from any browser without extension
- 🔄 **Cloud Sync** - Sync data across all platforms

## Tech Stack

### Monorepo Architecture
- **Package Manager**: pnpm with workspaces
- **Build Tool**: Turbo (turborepo) for efficient builds
- **Language**: TypeScript throughout

### Applications (`apps/`)
- `apps/browser-extension` - Browser extension (Chrome/Edge, Manifest V3)
- `apps/web` - Web application (Coming soon - Next.js)
- `apps/mobile` - Mobile app (Coming soon - React Native)

### Shared Packages (`packages/`)
- `packages/shared` - Shared business logic, types, utilities (platform-agnostic)
- `packages/storage` - Multi-platform storage adapters (Chrome Storage, localStorage, AsyncStorage)
- `packages/ui` - Shared UI components (currently web-focused, will support native)

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
   pnpm --filter @productivity-extension/browser-extension build
   ```

   Or use turbo to build all apps and packages:
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
   - Navigate to `apps/browser-extension/dist`
   - Click "Select Folder"

4. **Test it!**
   - Open a new tab (Ctrl+T / Cmd+T)
   - You should see the motivational dashboard with a quote!

## Development

### Start development server
```bash
pnpm --filter @productivity-extension/browser-extension dev
```

This starts Vite in development mode with hot module replacement (HMR). The extension will automatically rebuild when you make changes.

### Build for production
```bash
pnpm build
```

### Linting and Formatting
```bash
# Check for linting and formatting issues
pnpm lint

# Auto-fix issues
pnpm lint:fix

# Format code
pnpm format
```

See [LINTING.md](./LINTING.md) for full linting documentation (we use **Biome** - 50x faster than ESLint!).

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
├── apps/
│   ├── browser-extension/      # Browser extension (Chrome/Edge)
│   │   ├── src/
│   │   │   ├── components/     # React components
│   │   │   ├── stores/         # Zustand stores
│   │   │   ├── data/           # Seed quotes data
│   │   │   ├── manifest.json   # Extension manifest
│   │   │   ├── App.tsx
│   │   │   └── main.tsx
│   │   ├── public/
│   │   └── dist/              # Build output (load this in Chrome)
│   │
│   ├── web/                   # Web app (Coming soon)
│   └── mobile/                # React Native app (Coming soon)
│
├── packages/
│   ├── shared/               # Platform-agnostic business logic
│   │   └── src/
│   │       ├── types.ts      # Shared TypeScript types
│   │       ├── constants.ts  # Shared constants
│   │       └── utils.ts      # Shared utilities
│   │
│   ├── storage/              # Multi-platform storage
│   │   └── src/
│   │       ├── storage-interface.ts
│   │       ├── adapters/
│   │       │   ├── chrome-storage-adapter.ts  # For extension
│   │       │   ├── local-storage-adapter.ts   # For web
│   │       │   └── async-storage-adapter.ts   # For mobile
│   │       ├── chrome-storage.ts      # Legacy
│   │       └── storage-helpers.ts     # Legacy
│   │
│   └── ui/                   # Shared UI components
│       └── src/
│           ├── components/   # React components
│           └── lib/          # UI utilities
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

### Managing Daily Goals
- **Add a goal**: Type in the input field and press Enter or click "Add"
- **Complete a goal**: Click the circle icon next to the goal text
- **Delete a goal**: Hover over a goal and click the trash icon
- **Track progress**: View the progress bar showing completed vs. total goals
- **Clear completed**: Remove all completed goals with one click
- Goals are automatically organized by date and reset daily

### Creating Custom Quotes
- **Open the form**: Click the floating "+" button in the bottom-right corner
- **Fill in details**:
  - Quote text (required, up to 500 characters)
  - Author (required)
  - Category (select from 10 categories)
  - Source (optional) - Book title, URL, or reference
  - Personal notes (optional, up to 300 characters) - Why this quote matters to you
- **Save**: Click "Add Quote" to save
- **View**: Your custom quotes appear randomly alongside curated quotes
- **Identify**: Custom quotes show source and notes when displayed

## Customization

### Adding More Quotes

Edit `apps/browser-extension/src/data/seed-quotes.ts` to add new quotes:

```typescript
const NEW_CATEGORY_QUOTES = [
  { text: "Your quote here", author: "Author Name" },
  // Add more quotes...
];
```

### Changing Colors

Edit the Tailwind config in `apps/browser-extension/tailwind.config.js`:

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
- Make sure you selected the `apps/browser-extension/dist` folder
- Check that the build completed successfully
- Try rebuilding: `pnpm --filter @productivity-extension/browser-extension build`

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
