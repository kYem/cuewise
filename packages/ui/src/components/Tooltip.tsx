import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import type React from 'react';
import { cn } from '../lib/utils';

const TooltipProvider = TooltipPrimitive.Provider;
const TooltipRoot = TooltipPrimitive.Root;
const TooltipTrigger = TooltipPrimitive.Trigger;

interface TooltipContentProps
  extends React.ComponentPropsWithoutRef<typeof TooltipPrimitive.Content> {
  className?: string;
}

const TooltipContent = ({ className, sideOffset = 6, children, ...props }: TooltipContentProps) => (
  <TooltipPrimitive.Portal>
    <TooltipPrimitive.Content
      sideOffset={sideOffset}
      className={cn(
        'z-[100] max-w-[220px] rounded-md border border-border bg-surface px-2 py-1 text-xs font-medium text-primary shadow-lg',
        'animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95',
        'data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2',
        className
      )}
      {...props}
    >
      {children}
    </TooltipPrimitive.Content>
  </TooltipPrimitive.Portal>
);

// Self-contained tooltip: wraps its own provider so callers don't need a global
// one. `label` is the tooltip text; `children` is the trigger element.
interface TooltipProps {
  label: React.ReactNode;
  children: React.ReactNode;
  side?: 'top' | 'right' | 'bottom' | 'left';
  delayDuration?: number;
}

const Tooltip = ({ label, children, side = 'top', delayDuration = 200 }: TooltipProps) => (
  <TooltipProvider delayDuration={delayDuration}>
    <TooltipRoot>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent side={side}>{label}</TooltipContent>
    </TooltipRoot>
  </TooltipProvider>
);

export { Tooltip, TooltipProvider, TooltipRoot, TooltipTrigger, TooltipContent };
