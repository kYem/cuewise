---
"@cuewise/browser-extension": patch
---

Fix dark mode variant behavior for explicit light mode selection

When the user explicitly selected "Light" mode but their OS preferred dark mode, some UI elements (like reminder template icons) would still use dark mode colors. This was because Tailwind v4's `dark:` prefix utilities default to using `@media (prefers-color-scheme: dark)` instead of the `.dark` class selector.

Added `@variant dark` directive to configure Tailwind v4 to use class-based dark mode, ensuring the app's explicit theme selection always takes precedence over OS preference.
