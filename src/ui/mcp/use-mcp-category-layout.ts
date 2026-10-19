"use client";

import { useLayoutEffect, useRef, useState, type RefObject } from "react";

/** Measure localized categories in the available column, not the viewport. */
export function useMcpCategoryLayout({ enabled, scopeRef, localeKey }: {
  enabled: boolean;
  scopeRef: RefObject<HTMLElement | null>;
  localeKey: unknown;
}) {
  const [categoriesFit, setCategoriesFit] = useState(true);
  const [containerElement, setContainerElement] = useState<HTMLDivElement | null>(null);
  const measureRef = useRef<HTMLDivElement | null>(null);
  const categoryMenuRef = useRef<HTMLButtonElement | null>(null);
  const categoryMenuOpenRef = useRef(false);
  const categoryFocusPendingRef = useRef(false);
  useLayoutEffect(() => {
    if (!enabled) return;
    const container = containerElement, measure = measureRef.current;
    if (!container || !measure) return;
    let retired = false;
    const update = () => {
      if (retired) return;
      const style = getComputedStyle(container);
      const available = container.clientWidth - parseFloat(style.paddingInlineStart || "0") - parseFloat(style.paddingInlineEnd || "0");
      const fits = measure.scrollWidth > 0 && measure.scrollWidth <= available;
      const focused = document.activeElement;
      if ((fits && (focused === categoryMenuRef.current || categoryMenuOpenRef.current)) ||
        (!fits && scopeRef.current?.querySelector("nav")?.contains(focused))) {
        categoryFocusPendingRef.current = true;
      }
      if (fits) categoryMenuOpenRef.current = false;
      setCategoriesFit(fits);
    };
    const observer = new ResizeObserver(update);
    observer.observe(container);
    observer.observe(measure);
    const frame = window.requestAnimationFrame(update);
    void document.fonts?.ready.then(update);
    return () => { retired = true; observer.disconnect(); window.cancelAnimationFrame(frame); };
  }, [enabled, localeKey, containerElement, scopeRef]);
  useLayoutEffect(() => {
    if (!categoryFocusPendingRef.current) return;
    categoryFocusPendingRef.current = false;
    const target = categoriesFit
      ? scopeRef.current?.querySelector<HTMLButtonElement>('nav [aria-pressed="true"]')
      : categoryMenuRef.current;
    target?.focus({ preventScroll: true });
  }, [categoriesFit, scopeRef]);
  return { categoriesFit, setContainerElement, measureRef, categoryMenuRef, categoryMenuOpenRef };
}
