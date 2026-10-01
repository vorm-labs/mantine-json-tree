import React, { useEffect, useRef, useState } from 'react';
import type { JsonTreeOperation } from './lib/operations';
import type { JsonTreePathSegments } from './lib/path';

interface Drag {
  root: unknown;
  path: JsonTreePathSegments;
  pointer: number;
  handle: HTMLButtonElement;
  target?: { path: JsonTreePathSegments; after: boolean };
}
/** Pointer movement is transient. Only release over a same-array row requests a guarded move. */
export function useJsonTreeDrag(
  data: unknown,
  disabled: boolean,
  request: (op: JsonTreeOperation) => void
) {
  const scope = useRef<HTMLDivElement>(null);
  const live = useRef({ data, disabled, request });
  live.current = { data, disabled, request };
  const drag = useRef<Drag | undefined>(undefined);
  const [preview, setPreview] = useState<Drag>();
  const clear = () => {
    const previous = drag.current;
    drag.current = undefined;
    if (previous?.handle.hasPointerCapture(previous.pointer)) {
      previous.handle.releasePointerCapture(previous.pointer);
    }
    setPreview(undefined);
  };
  useEffect(() => {
    clear();
  }, [data, disabled]);
  useEffect(() => {
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') clear();
    };
    const interrupt = () => {
      if (drag.current) clear();
    };
    document.addEventListener('pointerdown', interrupt, true);
    window.addEventListener('blur', interrupt);
    document.addEventListener('keydown', escape, true);
    return () => {
      document.removeEventListener('pointerdown', interrupt, true);
      window.removeEventListener('blur', interrupt);
      document.removeEventListener('keydown', escape, true);
      drag.current = undefined;
    };
  }, []);
  const props = (path: JsonTreePathSegments): React.ButtonHTMLAttributes<HTMLButtonElement> => ({
    onPointerDown: (event) => {
      if (live.current.disabled || event.button !== 0) return;
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.focus();
      event.currentTarget.setPointerCapture(event.pointerId);
      const next = {
        root: live.current.data,
        path: [...path],
        pointer: event.pointerId,
        handle: event.currentTarget,
      };
      drag.current = next;
      setPreview(next);
    },
    onPointerMove: (event) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      if (live.current.disabled || !Object.is(current.root, live.current.data)) {
        clear();
        return;
      }
      const element = document
        .elementFromPoint(event.clientX, event.clientY)
        ?.closest<HTMLElement>('[data-json-row]');
      let target: Drag['target'];
      if (element && scope.current?.contains(element)) {
        const candidate: JsonTreePathSegments = JSON.parse(element.dataset.jsonRow!);
        if (
          typeof candidate[candidate.length - 1] === 'number' &&
          JSON.stringify(candidate.slice(0, -1)) === JSON.stringify(current.path.slice(0, -1))
        ) {
          const bounds = element.getBoundingClientRect();
          target = { path: candidate, after: event.clientY > bounds.top + bounds.height / 2 };
        }
      }
      const next = { ...current, target };
      drag.current = next;
      setPreview(next);
    },
    onPointerUp: (event) => {
      const current = drag.current;
      if (!current || current.pointer !== event.pointerId) return;
      clear();
      if (!current.target || live.current.disabled || !Object.is(current.root, live.current.data)) {
        return;
      }
      const from = Number(current.path[current.path.length - 1]);
      const slot =
        Number(current.target.path[current.target.path.length - 1]) +
        (current.target.after ? 1 : 0);
      const to = slot > from ? slot - 1 : slot;
      if (to !== from) {
        live.current.request({
          kind: 'array-move',
          pathSegments: current.path.slice(0, -1),
          from,
          to,
        });
      }
    },
    onPointerCancel: clear,
    onLostPointerCapture: clear,
  });
  return { scope, props, preview };
}
