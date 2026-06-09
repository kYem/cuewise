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
 * Thin wrapper around the lottie-web light build (no expressions / no eval, so it
 * is Manifest V3 CSP-safe). Plays once by default; with `autoplay={false}` it
 * renders the first frame statically (used for reduced-motion).
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

    if (onComplete !== undefined) {
      animation.addEventListener('complete', onComplete);
    }

    return () => {
      animation.destroy();
    };
  }, [animationData, loop, autoplay, onComplete]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
