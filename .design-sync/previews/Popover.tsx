import { Button, Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Calendar, Copy, Pencil, Trash2 } from 'lucide-react';

const ITEMS = [
  { label: 'Edit goal', icon: Pencil },
  { label: 'Set due date', icon: Calendar },
  { label: 'Duplicate', icon: Copy },
  { label: 'Delete', icon: Trash2 },
];

export const Menu = () => (
  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 8 }}>
    <Popover defaultOpen>
      <PopoverTrigger asChild>
        <Button variant="outline">Goal options</Button>
      </PopoverTrigger>
      <PopoverContent align="start" sideOffset={8}>
        <div style={{ padding: 6, minWidth: 180 }}>
          {ITEMS.map(({ label, icon: Icon }) => (
            <button
              key={label}
              type="button"
              className="text-primary hover:bg-surface-variant"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                width: '100%',
                padding: '8px 10px',
                borderRadius: 8,
                fontSize: 14,
                textAlign: 'left',
              }}
            >
              <Icon className="w-4 h-4 text-secondary" />
              {label}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  </div>
);
