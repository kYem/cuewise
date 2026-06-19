import { Select } from '@cuewise/ui';
import { useState } from 'react';

const CATEGORIES = [
  { value: 'inspiration', label: 'Inspiration', color: '#8b5cf6' },
  { value: 'productivity', label: 'Productivity', color: '#0ea5e9' },
  { value: 'mindfulness', label: 'Mindfulness', color: '#10b981' },
  { value: 'success', label: 'Success', color: '#f59e0b' },
];

export const Closed = () => {
  const [value, setValue] = useState('productivity');
  return (
    <div style={{ width: 260 }}>
      <Select value={value} onChange={setValue} options={CATEGORIES} aria-label="Category" />
    </div>
  );
};

export const Open = () => {
  const [value, setValue] = useState('productivity');
  return (
    <div style={{ width: 260, height: 230 }}>
      <Select
        value={value}
        onChange={setValue}
        options={CATEGORIES}
        autoOpen
        aria-label="Category"
      />
    </div>
  );
};
