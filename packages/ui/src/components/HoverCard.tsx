import * as HoverCardPrimitive from '@radix-ui/react-hover-card';
import type React from 'react';
import { cn } from '../lib/utils';

const HoverCard = HoverCardPrimitive.Root;
const HoverCardTrigger = HoverCardPrimitive.Trigger;

interface HoverCardContentProps
  extends React.ComponentPropsWithoutRef<typeof HoverCardPrimitive.Content> {
  className?: string;
}

const HoverCardContent = ({
  className,
  align = 'start',
  sideOffset = 6,
  children,
  ...props
}: HoverCardContentProps) => (
  <HoverCardPrimitive.Portal>
    <HoverCardPrimitive.Content
      align={align}
      sideOffset={sideOffset}
      className={cn(
        'z-[100] w-64 rounded-xl border border-border bg-surface-elevated backdrop-blur-xl p-4 shadow-xl',
        'animate-fade-in',
        className
      )}
      {...props}
    >
      {children}
    </HoverCardPrimitive.Content>
  </HoverCardPrimitive.Portal>
);

export { HoverCard, HoverCardContent, HoverCardTrigger };
