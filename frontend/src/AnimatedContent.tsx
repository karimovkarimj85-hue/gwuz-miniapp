import type { CSSProperties, ReactNode } from "react";
import { useEffect, useRef } from "react";
import gsap from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";

gsap.registerPlugin(ScrollTrigger);

export type AnimatedContentProps = {
  children?: ReactNode;
  /** Селектор или Element — скроллер для ScrollTrigger (пусто = window) */
  container?: HTMLElement | string | null;
  distance?: number;
  direction?: "vertical" | "horizontal";
  reverse?: boolean;
  duration?: number;
  ease?: string;
  initialOpacity?: number;
  animateOpacity?: boolean;
  scale?: number;
  threshold?: number;
  delay?: number;
  disappearAfter?: number;
  disappearDuration?: number;
  disappearEase?: string;
  onComplete?: () => void;
  onDisappearanceComplete?: () => void;
  className?: string;
  style?: CSSProperties;
  /** Без скролла: анимация при монтировании (подходит для первого экрана в Mini App) */
  animateOnMount?: boolean;
};

export default function AnimatedContent({
  children,
  container,
  distance = 100,
  direction = "vertical",
  reverse = false,
  duration = 0.8,
  ease = "power3.out",
  initialOpacity = 0,
  animateOpacity = true,
  scale = 1,
  threshold = 0.1,
  delay = 0,
  disappearAfter = 0,
  disappearDuration = 0.5,
  disappearEase = "power3.in",
  onComplete,
  onDisappearanceComplete,
  className = "",
  style,
  animateOnMount = false,
}: AnimatedContentProps) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return undefined;

    const axis = direction === "horizontal" ? "x" : "y";
    const offset = reverse ? -distance : distance;

    gsap.set(el, {
      [axis]: offset,
      scale,
      opacity: animateOpacity ? initialOpacity : 1,
      visibility: "visible",
    });

    if (animateOnMount) {
      const tl = gsap.timeline({
        delay,
        onComplete: () => {
          onComplete?.();
          if (disappearAfter > 0) {
            gsap.to(el, {
              [axis]: reverse ? distance : -distance,
              scale: 0.8,
              opacity: animateOpacity ? initialOpacity : 0,
              delay: disappearAfter,
              duration: disappearDuration,
              ease: disappearEase,
              onComplete: () => onDisappearanceComplete?.(),
            });
          }
        },
      });
      tl.to(el, { [axis]: 0, scale: 1, opacity: 1, duration, ease });
      return () => {
        tl.kill();
        gsap.killTweensOf(el);
      };
    }

    let scrollerTarget: Element | Window | null =
      container instanceof HTMLElement ? container : null;
    if (typeof container === "string") {
      scrollerTarget = document.querySelector(container);
    }
    if (!scrollerTarget) {
      scrollerTarget = document.getElementById("snap-main-container") || window;
    }

    const startPct = (1 - threshold) * 100;

    const tl = gsap.timeline({
      paused: true,
      delay,
      onComplete: () => {
        onComplete?.();
        if (disappearAfter > 0) {
          gsap.to(el, {
            [axis]: reverse ? distance : -distance,
            scale: 0.8,
            opacity: animateOpacity ? initialOpacity : 0,
            delay: disappearAfter,
            duration: disappearDuration,
            ease: disappearEase,
            onComplete: () => onDisappearanceComplete?.(),
          });
        }
      },
    });

    tl.to(el, { [axis]: 0, scale: 1, opacity: 1, duration, ease });

    const st = ScrollTrigger.create({
      trigger: el,
      scroller: scrollerTarget === window ? undefined : (scrollerTarget as HTMLElement),
      start: `top ${startPct}%`,
      once: true,
      onEnter: () => tl.play(),
    });

    return () => {
      st.kill();
      tl.kill();
    };
  }, [
    animateOnMount,
    container,
    delay,
    direction,
    disappearAfter,
    disappearDuration,
    disappearEase,
    distance,
    duration,
    ease,
    initialOpacity,
    animateOpacity,
    onComplete,
    onDisappearanceComplete,
    reverse,
    scale,
    threshold,
  ]);

  return (
    <div ref={ref} className={className} style={{ visibility: "hidden", ...style }}>
      {children}
    </div>
  );
}
