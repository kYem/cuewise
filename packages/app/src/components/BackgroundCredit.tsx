import { RefreshCw } from 'lucide-react';
import type React from 'react';
import { getPhotoCredit } from '../utils/unsplash';

interface BackgroundCreditProps {
  imageUrl: string | null;
  onRefresh: () => void;
  isRefreshing?: boolean;
}

const LINK_CLASS = 'underline underline-offset-2 hover:text-white transition-colors';

/**
 * Credits the background photo and offers a fresh one. Names the photographer only
 * when known — an unattributed photo says just "from Unsplash" rather than guessing.
 */
export const BackgroundCredit: React.FC<BackgroundCreditProps> = ({
  imageUrl,
  onRefresh,
  isRefreshing = false,
}) => {
  if (imageUrl === null) {
    return null;
  }

  const credit = getPhotoCredit(imageUrl);

  return (
    // Bottom-left: the reminders button owns the bottom-right corner and would eat the clicks.
    <div className="fixed bottom-3 left-3 z-30 flex items-center gap-3 text-xs text-white/60">
      <p>
        {credit.photographer !== null && credit.photographerUrl !== null ? (
          <>
            Photo by{' '}
            <a
              href={credit.photographerUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={LINK_CLASS}
            >
              {credit.photographer}
            </a>{' '}
            on{' '}
          </>
        ) : (
          'Photo from '
        )}
        <a href={credit.sourceUrl} target="_blank" rel="noopener noreferrer" className={LINK_CLASS}>
          Unsplash
        </a>
      </p>
      <button
        type="button"
        onClick={onRefresh}
        disabled={isRefreshing}
        aria-label="New background"
        title="New background"
        className="p-1.5 rounded-full bg-white/10 hover:bg-white/20 disabled:opacity-40 disabled:cursor-not-allowed transition-colors focus:outline-none focus:ring-2 focus:ring-white/50"
      >
        <RefreshCw className={`w-3.5 h-3.5 ${isRefreshing ? 'animate-spin' : ''}`} />
      </button>
    </div>
  );
};
