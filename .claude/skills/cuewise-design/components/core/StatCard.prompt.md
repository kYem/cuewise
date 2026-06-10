Metric tile for the Insights dashboard — tinted icon chip, big display value, label + sublabel.

```jsx
import { Flame, Target } from 'lucide-react';

<StatCard icon={<Flame />} value={1} label="Current Streak" sublabel="Longest: 1 days" tint="warning" />
<StatCard icon={<Target />} value={2} label="Goals Today" sublabel="This week: 2" tint="success" />
```

- **tint**: `primary` (default) / `success` / `warning` / `error` — colors both the chip and the value.
- Value uses Poppins; keep labels short and Title Case.
