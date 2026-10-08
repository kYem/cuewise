import { describeThrown, logger } from '@cuewise/shared';
import type { AnimationItem } from 'lottie-web';
import { useEffect, useRef } from 'react';

interface LottiePlayerProps {
  animationData: object;
  loop?: boolean;
  autoplay?: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * Thin wrapper around the lottie-web light build — no expressions/eval, so it's
 * Manifest V3 CSP-safe. Defaults to play-once (loop=false), autoplaying; with
 * autoplay={false} it freezes at frame 0 (the reduced-motion path).
 */
export function LottiePlayer({
  animationData,
  loop = false,
  autoplay = true,
  onComplete,
  className,
}: LottiePlayerProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (container === null) {
      return;
    }

    let cancelled = false;
    let animation: AnimationItem | null = null;

    // Loaded on first use: the player is ~170 kB and every animation is decorative.
    import('lottie-web/build/player/lottie_light')
      .then(({ default: lottie }) => {
        if (cancelled) {
          return;
        }
        animation = lottie.loadAnimation({
          container,
          renderer: 'svg',
          loop,
          autoplay,
          animationData,
        });

        // Explicitly hold the first frame when not autoplaying (reduced-motion),
        // rather than relying on the renderer's incidental frame-0 paint.
        if (!autoplay) {
          animation.goToAndStop(0, true);
        }

        if (onComplete !== undefined) {
          animation.addEventListener('complete', onComplete);
        }
      })
      .catch((error: unknown) => {
        logger.error(`Lottie player failed to load: ${describeThrown(error)}`, error);
        // Callers wait on completion to clear state (the celebration guard), so never strand them.
        if (!cancelled && onComplete !== undefined) {
          onComplete();
        }
      });

    return () => {
      cancelled = true;
      if (animation !== null) {
        animation.destroy();
      }
    };
  }, [animationData, loop, autoplay, onComplete]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
