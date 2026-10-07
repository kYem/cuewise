import type React from 'react';

// The way out for a user with no recovery code and no other device to approve this one.
export const START_OVER_LABEL = 'Lost your code? Delete sync account and start over';

export const StartOverLink: React.FC<{ onClick: () => void }> = ({ onClick }) => (
  <button
    type="button"
    onClick={onClick}
    className="w-fit text-xs font-medium text-red-600 underline-offset-2 hover:underline"
  >
    {START_OVER_LABEL}
  </button>
);
