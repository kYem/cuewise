Round, frosted icon button — use for floating navigation, quote actions (favorite/hide/refresh) and Pomodoro controls.

```jsx
import { Settings, Heart, RefreshCw } from 'lucide-react';

<IconButton icon={<Settings />} title="Settings" />
<IconButton icon={<Heart />} variant="favorite" active title="Favorite" />
<IconButton icon={<RefreshCw />} variant="primary" size="lg" />
```

- **variant**: `surface` (translucent, soft shadow, default) · `primary` (violet) · `favorite` (red when `active`).
- **size**: `sm` (34) / `md` (42) / `lg` (48). Hovers lift with `scale(1.08)`.
