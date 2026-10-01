import React, { useEffect, useRef } from 'react';

/** React ancestry includes portals; document listeners alone cannot identify owned popups. */
export function useJsonTreeDismiss(
  draft: object | undefined,
  outside: boolean,
  cancel: (restoreFocus: boolean) => void
) {
  const inside = useRef(new WeakSet<Event>());
  const latest = useRef({ draft, cancel });
  latest.current = { draft, cancel };
  useEffect(() => {
    if (!draft || !outside) return;
    const pending = new Set<ReturnType<typeof setTimeout>>();
    const pointer = (event: PointerEvent) => {
      if (event.button !== 0) return;
      // Defer until React capture handlers have marked this event, including portals.
      const timer = setTimeout(() => {
        pending.delete(timer);
        if (latest.current.draft === draft && !inside.current.has(event)) {
          latest.current.cancel(false);
        }
      }, 0);
      pending.add(timer);
    };
    document.addEventListener('pointerdown', pointer, true);
    return () => {
      document.removeEventListener('pointerdown', pointer, true);
      pending.forEach(clearTimeout);
    };
  }, [draft, outside]);
  return {
    onPointerDownCapture: (event: React.PointerEvent) => {
      inside.current.add(event.nativeEvent);
    },
    onKeyDownCapture: (event: React.KeyboardEvent) => {
      if (
        draft &&
        event.key === 'Escape' &&
        !event.nativeEvent.isComposing &&
        event.keyCode !== 229
      ) {
        event.preventDefault();
        event.stopPropagation();
        latest.current.cancel(true);
      }
    },
  };
}
