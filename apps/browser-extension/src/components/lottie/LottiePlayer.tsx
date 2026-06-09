import lottie from 'lottie-web/build/player/lottie_light';
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

    const animation = lottie.loadAnimation({
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

    return () => {
      animation.destroy();
    };
  }, [animationData, loop, autoplay, onComplete]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
