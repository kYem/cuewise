import { Button, TooltipContent, TooltipProvider, TooltipRoot, TooltipTrigger } from '@cuewise/ui';
import { Star } from 'lucide-react';

// Radix Tooltip is hover/focus-only; compose the parts with `defaultOpen` so the
// bubble renders statically in the card. The convenience <Tooltip label=… side=…>
// wraps these same parts and is the API callers normally use (see the prompt doc).
export const Default = () => (
  <div style={{ display: 'flex', justifyContent: 'center', paddingTop: 56 }}>
    <TooltipProvider>
      <TooltipRoot defaultOpen>
        <TooltipTrigger asChild>
          <Button variant="outline">
            <Star className="w-4 h-4" />
            Favorite
          </Button>
        </TooltipTrigger>
        <TooltipContent side="bottom">Add this quote to your favorites</TooltipContent>
      </TooltipRoot>
    </TooltipProvider>
  </div>
);
