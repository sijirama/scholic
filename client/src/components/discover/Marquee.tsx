import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';

interface MarqueeProps {
  speed?: number;        // pixels per frame; lower = slower
  direction?: 'left' | 'right';
  pauseOnHover?: boolean;
  gap?: number;
  staticAlign?: 'left' | 'center';
  children: React.ReactNode;
}

/**
 * Marquee — auto-scrolls its children horizontally on a rAF loop.
 *
 * Always rendered at 100% of its parent (no viewport breakout); cards align
 * to the page's content column. The container clips overflow and a mask
 * gradient softens the left/right edges.
 *
 * Render path:
 *   1. First paint: render one copy of `children`, measure its width.
 *   2. If single-copy width fits inside the container, stay static — render
 *      one copy, no animation, no duplicate. (A row with a visible duplicate
 *      looks broken; honest static is better.)
 *   3. Otherwise render two copies (the second `aria-hidden`) and run the
 *      rAF translateX loop. Once the offset passes one copy's width, wrap
 *      back to 0 — the boundary lines up so the loop is seamless.
 */
const Marquee: React.FC<MarqueeProps> = ({
  speed = 0.5,
  direction = 'left',
  pauseOnHover = true,
  gap = 14,
  staticAlign = 'center',
  children,
}) => {
  const trackRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const animRef = useRef<number | null>(null);
  const pausedRef = useRef(false);
  const posRef = useRef(0);
  const [paused, setPaused] = useState(false);
  const [shouldAnimate, setShouldAnimate] = useState(false);

  useEffect(() => {
    pausedRef.current = paused;
  }, [paused]);

  // Measure content vs container after first paint, and on resize.
  useLayoutEffect(() => {
    const measure = () => {
      const track = trackRef.current;
      const container = containerRef.current;
      if (!track || !container) return;
      const singleWidth = shouldAnimate ? track.scrollWidth / 2 : track.scrollWidth;
      const containerWidth = container.clientWidth;
      // 8px slack so a near-perfect fit doesn't oscillate.
      const next = singleWidth > containerWidth + 8;
      setShouldAnimate(prev => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    if (containerRef.current) ro.observe(containerRef.current);
    if (trackRef.current) ro.observe(trackRef.current);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [children]);

  useEffect(() => {
    if (!shouldAnimate) {
      if (animRef.current) cancelAnimationFrame(animRef.current);
      animRef.current = null;
      posRef.current = 0;
      if (trackRef.current) trackRef.current.style.transform = 'translateX(0)';
      return;
    }
    const track = trackRef.current;
    if (!track) return;

    // Seed pos so direction='right' starts mid-track (showing copy 2),
    // otherwise the first frame jumps visibly when pos wraps.
    const initialHalf = track.scrollWidth / 2;
    if (direction === 'right' && initialHalf > 0) {
      posRef.current = initialHalf;
      track.style.transform = `translateX(${-posRef.current}px)`;
    }

    const tick = () => {
      if (!pausedRef.current) {
        const half = track.scrollWidth / 2;
        if (half > 0) {
          posRef.current += direction === 'left' ? speed : -speed;
          // Keep pos in [0, half) so translateX wraps seamlessly. Both copies
          // are identical so the jump from `half-ε` back to 0 is invisible.
          if (posRef.current >= half) posRef.current -= half;
          if (posRef.current < 0) posRef.current += half;
          track.style.transform = `translateX(${-posRef.current}px)`;
        }
      }
      animRef.current = requestAnimationFrame(tick);
    };
    animRef.current = requestAnimationFrame(tick);
    return () => {
      if (animRef.current) cancelAnimationFrame(animRef.current);
    };
  }, [shouldAnimate, speed, direction]);

  return (
    <div
      ref={containerRef}
      onMouseEnter={() => pauseOnHover && setPaused(true)}
      onMouseLeave={() => pauseOnHover && setPaused(false)}
      style={{
        // Always break out of the parent container to span the full viewport.
        // The Discover page has overflowX: hidden on its root so this can't
        // create a horizontal scrollbar.
        position: 'relative',
        width: '100vw',
        left: '50%',
        marginLeft: '-50vw',
        overflow: 'hidden',
        padding: '4px 0',
        // Only fade edges when actually scrolling — a fade on a static row
        // would clip the first/last card's edges visually.
        WebkitMaskImage: shouldAnimate
          ? 'linear-gradient(to right, transparent 0, #000 60px, #000 calc(100% - 60px), transparent 100%)'
          : 'none',
        maskImage: shouldAnimate
          ? 'linear-gradient(to right, transparent 0, #000 60px, #000 calc(100% - 60px), transparent 100%)'
          : 'none',
      }}
    >
      <div
        ref={trackRef}
        style={{
          display: 'flex',
          gap: `${gap}px`,
          willChange: shouldAnimate ? 'transform' : 'auto',
          width: shouldAnimate ? 'max-content' : 'auto',
          // When content fits, center it in the 100vw container so cards don't
          // hug the viewport's left edge looking detached from the page.
          justifyContent: shouldAnimate ? 'flex-start' : staticAlign,
        }}
      >
        {children}
        {shouldAnimate && (
          <div style={{ display: 'contents' }} aria-hidden>
            {children}
          </div>
        )}
      </div>
    </div>
  );
};

export default Marquee;
