Primary call-to-action button for Cuewise — use for any clickable action; pick `variant` by emphasis and `rounded="full"` for floating/pill actions.

```jsx
import { RefreshCw } from 'lucide-react';

<Button variant="primary" icon={<RefreshCw />}>New Quote</Button>
<Button variant="secondary" rounded="full">Add</Button>
<Button variant="ghost" size="sm">Show Incomplete</Button>
<Button variant="danger" size="sm">Delete</Button>
```

- **variant**: `primary` (violet 600, white) · `secondary` (surface + border) · `ghost` (transparent) · `danger` (red).
- **size**: `sm` / `md` / `lg`. **rounded**: `lg` (default) / `xl` / `full`.
- Hover darkens/lightens the surface; disabled dims to 50%. Icons are Lucide elements, auto-sized.
