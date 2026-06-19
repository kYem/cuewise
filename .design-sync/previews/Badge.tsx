import { Badge } from '@cuewise/ui';

export const Variants = () => (
  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
    <Badge>Default</Badge>
    <Badge variant="primary">Pro</Badge>
    <Badge variant="secondary">Beta</Badge>
    <Badge variant="success">Completed</Badge>
    <Badge variant="warning">Due soon</Badge>
    <Badge variant="danger">Overdue</Badge>
  </div>
);

export const InContext = () => (
  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      Daily streak <Badge variant="success">12 days</Badge>
    </span>
    <span style={{ display: 'inline-flex', gap: 8, alignItems: 'center' }}>
      Focus plan <Badge variant="primary">Pro</Badge>
    </span>
  </div>
);
