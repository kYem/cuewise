import type React from 'react';

// The way out for a user with no recovery code and no other device to approve this one.
export const START_OVER_LABEL = 'Lost your code? Delete sync account and start over';

export const StartOverLink: React.FC<{ onClick: () => void; disabled?: boolean }> = ({
  onClick,
  disabled = false,
}) => (
  <button
    type="button"
    onClick={onClick}
    disabled={disabled}
    className="w-fit text-xs font-medium text-red-600 underline-offset-2 hover:underline disabled:cursor-not-allowed disabled:opacity-50"
  >
    {START_OVER_LABEL}
  </button>
);
