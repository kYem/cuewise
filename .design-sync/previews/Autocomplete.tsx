import { Autocomplete } from '@cuewise/ui';
import { useState } from 'react';

const TAGS = ['Deep work', 'Design', 'Writing', 'Review', 'Planning', 'Research'];

export const Default = () => {
  const [value, setValue] = useState('');
  return (
    <div style={{ width: 320 }}>
      <Autocomplete value={value} onChange={setValue} suggestions={TAGS} placeholder="Add a tag…" />
    </div>
  );
};

export const WithValue = () => {
  const [value, setValue] = useState('Design');
  return (
    <div style={{ width: 320 }}>
      <Autocomplete value={value} onChange={setValue} suggestions={TAGS} placeholder="Add a tag…" />
    </div>
  );
};

export const ErrorState = () => {
  const [value, setValue] = useState('Unknown tag');
  return (
    <div style={{ width: 320 }}>
      <Autocomplete value={value} onChange={setValue} suggestions={TAGS} error />
    </div>
  );
};
