import { Input } from '@cuewise/ui';

export const Default = () => (
  <div style={{ width: 320 }}>
    <Input placeholder="Search quotes…" />
  </div>
);

export const WithValue = () => (
  <div style={{ width: 320 }}>
    <Input defaultValue="Morning routine" />
  </div>
);

export const ErrorState = () => (
  <div style={{ width: 320 }}>
    <Input defaultValue="not-an-email" error />
  </div>
);

export const Disabled = () => (
  <div style={{ width: 320 }}>
    <Input defaultValue="Locked field" disabled />
  </div>
);
