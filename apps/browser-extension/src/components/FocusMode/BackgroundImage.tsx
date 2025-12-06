import { cn } from '@cuewise/ui';
import { useEffect, useState } from 'react';

interface BackgroundImageProps {
  url: string | null;
  isLoading: boolean;
}

/**
 * Background image component with smooth fade transitions.
 * Shows a loading state while image is loading, then fades in.
 */
export function BackgroundImage({ url, isLoading }: BackgroundImageProps) {
  const [loadedUrl, setLoadedUrl] = useState<string | null>(null);
  const [isTransitioning, setIsTransitioning] = useState(false);

  useEffect(() => {
    if (!url) {
      return;
    }

    // Start transition
    setIsTransitioning(true);

    const img = new Image();

    img.onload = () => {
      setLoadedUrl(url);
      // Small delay to allow CSS transition to work
      requestAnimationFrame(() => {
        setIsTransitioning(false);
      });
    };

    img.onerror = () => {
      // Keep previous image on error
      setIsTransitioning(false);
    };

    img.src = url;
  }, [url]);

  return (
    <>
      {/* Base dark background */}
      <div className="absolute inset-0 bg-gradient-to-br from-gray-900 via-gray-800 to-gray-900" />

      {/* Image layer with fade transition */}
      {loadedUrl && (
        <div
          className={cn(
            'absolute inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000',
            isTransitioning ? 'opacity-0' : 'opacity-100'
          )}
          style={{ backgroundImage: `url(${loadedUrl})` }}
          role="img"
          aria-label="Focus mode background"
        />
      )}

      {/* Loading indicator */}
      {isLoading && !loadedUrl && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div className="w-8 h-8 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
        </div>
      )}
    </>
  );
}
