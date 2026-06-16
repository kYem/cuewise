import * as PopoverPrimitive from '@radix-ui/react-popover';
import type React from 'react';
import { cn } from '../lib/utils';

const Popover = PopoverPrimitive.Root;
const PopoverTrigger = PopoverPrimitive.Trigger;
const PopoverAnchor = PopoverPrimitive.Anchor;
const PopoverClose = PopoverPrimitive.Close;

interface PopoverContentProps
  extends React.ComponentPropsWithoutRef<typeof PopoverPrimitive.Content> {
  className?: string;
}

const PopoverContent = ({
  className,
  align = 'end',
  sideOffset = 4,
  children,
  ...props
}: PopoverContentProps) => (
  <PopoverPrimitive.Portal>
    <PopoverPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-[100] min-w-[180px] overflow-hidden rounded-lg border-2 border-border bg-surface shadow-lg',
        'animate-fade-in',
        className
      )}
      {...props}
    >
      {children}
    </PopoverPrimitive.Content>
  </PopoverPrimitive.Portal>
);

export { Popover, PopoverTrigger, PopoverContent, PopoverAnchor, PopoverClose };
