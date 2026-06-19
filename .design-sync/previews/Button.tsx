import { Button } from '@cuewise/ui';
import { Plus, Sparkles } from 'lucide-react';

export const Variants = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button variant="primary">Start focus</Button>
    <Button variant="secondary">Save draft</Button>
    <Button variant="outline">Add later</Button>
    <Button variant="ghost">Cancel</Button>
  </div>
);

export const Sizes = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button size="sm">Small</Button>
    <Button size="md">Medium</Button>
    <Button size="lg">Large</Button>
  </div>
);

export const WithIcon = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center' }}>
    <Button variant="primary">
      <Plus className="w-4 h-4" style={{ marginRight: 8 }} />
      Add goal
    </Button>
    <Button variant="outline">
      <Sparkles className="w-4 h-4" style={{ marginRight: 8 }} />
      New quote
    </Button>
  </div>
);

export const Disabled = () => (
  <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
    <Button variant="primary" disabled>
      Saving…
    </Button>
    <Button variant="outline" disabled>
      Unavailable
    </Button>
  </div>
);
