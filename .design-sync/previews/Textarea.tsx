import { Textarea } from '@cuewise/ui';
import { useState } from 'react';

export const Default = () => (
  <div style={{ width: 360 }}>
    <Textarea placeholder="Write a note for this goal…" rows={3} />
  </div>
);

export const WithCount = () => {
  const [value, setValue] = useState('Ship the new calendar view and review feedback.');
  return (
    <div style={{ width: 360 }}>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        showCount
        maxLength={120}
        rows={3}
      />
    </div>
  );
};

export const ErrorState = () => (
  <div style={{ width: 360 }}>
    <Textarea defaultValue="" placeholder="This field is required" error rows={3} />
  </div>
);
