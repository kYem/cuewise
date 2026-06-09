import lottie from 'lottie-web/build/player/lottie_light';
import { useEffect, useRef } from 'react';

interface LottiePlayerProps {
  animationData: object;
  loop?: boolean;
  onComplete?: () => void;
  className?: string;
}

/**
 * Thin wrapper around the lottie-web light build (no expressions / no eval, so it
 * is Manifest V3 CSP-safe). Plays once by default and reports completion.
 */
export function LottiePlayer({
  animationData,
  loop = false,
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
      autoplay: true,
      animationData,
    });

    if (onComplete !== undefined) {
      animation.addEventListener('complete', onComplete);
    }

    return () => {
      animation.destroy();
    };
  }, [animationData, loop, onComplete]);

  return <div ref={containerRef} className={className} aria-hidden="true" />;
}
