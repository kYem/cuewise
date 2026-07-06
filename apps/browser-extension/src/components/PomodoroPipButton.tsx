import { PictureInPicture2 } from 'lucide-react';
import type React from 'react';
import { usePomodoroPip } from './PomodoroPipProvider';

interface PomodoroPipButtonProps {
  className: string;
  iconClassName: string;
}

/** Pop-out control: opens the floating timer. Renders nothing without Document PiP. */
export const PomodoroPipButton: React.FC<PomodoroPipButtonProps> = ({
  className,
  iconClassName,
}) => {
  const { isSupported, open } = usePomodoroPip();
  if (!isSupported) {
    return null;
  }

  // Stop bubbling — harmless standalone, required when nested in the pill's
  // role="button" navigate handler.
  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    open();
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    e.stopPropagation();
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      onKeyDown={handleKeyDown}
      className={className}
      title="Pop out timer into a floating window"
      aria-label="Pop out timer into a floating window"
    >
      <PictureInPicture2 className={iconClassName} />
    </button>
  );
};
