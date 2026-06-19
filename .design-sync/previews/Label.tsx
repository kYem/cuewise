import { Input, Label } from '@cuewise/ui';

export const Default = () => (
  <div style={{ width: 320 }}>
    <Label htmlFor="goal">Goal title</Label>
    <Input id="goal" placeholder="e.g. Finish design review" />
  </div>
);

export const Required = () => (
  <div style={{ width: 320 }}>
    <Label htmlFor="email" required>
      Email address
    </Label>
    <Input id="email" type="email" placeholder="you@example.com" />
  </div>
);
