import { useEffect, useRef, useState } from "react";
import gsap from "gsap";

import "./TextType.css";

export type TextTypeProps = {
  text: string;
  typingSpeed?: number;
  initialDelay?: number;
  className?: string;
  showCursor?: boolean;
  cursorCharacter?: string;
  cursorClassName?: string;
  cursorBlinkDuration?: number;
  textColor?: string;
  startOnVisible?: boolean;
};

export default function TextType({
  text,
  typingSpeed = 36,
  initialDelay = 400,
  className = "",
  showCursor = true,
  cursorCharacter = "|",
  cursorClassName = "",
  cursorBlinkDuration = 0.55,
  textColor = "inherit",
  startOnVisible = false,
}: TextTypeProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cursorRef = useRef<HTMLSpanElement>(null);
  const [displayed, setDisplayed] = useState("");
  const [visible, setVisible] = useState(!startOnVisible);

  useEffect(() => {
    if (!startOnVisible || !containerRef.current) return undefined;
    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((e) => {
          if (e.isIntersecting) setVisible(true);
        });
      },
      { threshold: 0.1 },
    );
    observer.observe(containerRef.current);
    return () => observer.disconnect();
  }, [startOnVisible]);

  useEffect(() => {
    if (!showCursor || !cursorRef.current) return undefined;
    const tw = gsap.to(cursorRef.current, {
      opacity: 0,
      duration: cursorBlinkDuration,
      repeat: -1,
      yoyo: true,
      ease: "power2.inOut",
    });
    return () => {
      tw.kill();
    };
  }, [cursorBlinkDuration, showCursor]);

  useEffect(() => {
    if (!visible) return undefined;
    let i = 0;
    let id: ReturnType<typeof setTimeout>;

    function tick() {
      if (i <= text.length) {
        setDisplayed(text.slice(0, i));
        i += 1;
        id = window.setTimeout(tick, typingSpeed);
      }
    }

    const startId = window.setTimeout(tick, initialDelay);

    return () => {
      clearTimeout(startId);
      clearTimeout(id);
    };
  }, [initialDelay, text, typingSpeed, visible]);

  return (
    <div ref={containerRef} className={`text-type ${className}`.trim()}>
      <span className="text-type__content" style={{ color: textColor }}>
        {displayed}
      </span>
      {showCursor && (
        <span ref={cursorRef} className={`text-type__cursor ${cursorClassName}`.trim()}>
          {cursorCharacter}
        </span>
      )}
    </div>
  );
}
