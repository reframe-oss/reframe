"use client";

import { useEffect, useRef } from "react";
import isChromatic from "chromatic/isChromatic";

interface Props {
  animationData: object;
  loop?: boolean;
  autoplay?: boolean;
  className?: string;
  style?: React.CSSProperties;
  label?: string;
}

export default function LottiePlayer({
  animationData,
  loop = true,
  autoplay = true,
  className,
  style,
  label,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);

  // lottie-web plays through requestAnimationFrame, which no amount of CSS can
  // freeze. Chromatic screenshots at an arbitrary moment, so a playing
  // animation reports a visual change on every build that has nothing to do
  // with the code. Rendering the first frame statically keeps snapshots
  // deterministic while still exercising the component.
  //
  // isChromatic() is false everywhere except inside Chromatic's renderer, so
  // this has no effect on the app or on local Storybook.
  const shouldAutoplay = autoplay && !isChromatic();

  useEffect(() => {
    if (!containerRef.current) return;
    let cancelled = false;
    let anim: { destroy: () => void } | null = null;

    import("lottie-web").then((mod) => {
      if (cancelled || !containerRef.current) return;
      const lottie = mod.default ?? mod;
      anim = lottie.loadAnimation({
        container: containerRef.current,
        renderer: "svg",
        loop,
        autoplay: shouldAutoplay,
        animationData,
      });
    }).catch((error) => {
      if (!cancelled) {
        console.error("Failed to load Lottie animation:", error);
      }
    });

    return () => {
      cancelled = true;
      anim?.destroy();
    };
  }, [animationData, loop, shouldAutoplay]);

  return (
    <>
      <div
        ref={containerRef}
        className={className}
        style={style}
        aria-hidden="true"
      />
      {label && <span className="sr-only">{label}</span>}
    </>
  );
}
