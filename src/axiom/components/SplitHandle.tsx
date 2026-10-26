import { useRef } from 'react';
import type { PointerEvent } from 'react';

interface SplitHandleProps {
  direction: 'x' | 'y';
  value: number;
  min: number;
  max: number;
  invert?: boolean;
  className?: string;
  label: string;
  onChange: (value: number) => void;
}

interface DragState {
  pointer: number;
  value: number;
}

export default function SplitHandle({
  direction,
  value,
  min,
  max,
  invert = false,
  className = '',
  label,
  onChange,
}: SplitHandleProps) {
  const drag = useRef<DragState | null>(null);
  const pointerKey = direction === 'x' ? 'clientX' : 'clientY';

  const onPointerDown = (event: PointerEvent<HTMLDivElement>): void => {
    event.preventDefault();
    event.currentTarget.setPointerCapture(event.pointerId);
    drag.current = { pointer: event[pointerKey], value };
  };

  const onPointerMove = (event: PointerEvent<HTMLDivElement>): void => {
    if (!drag.current) return;
    const delta = event[pointerKey] - drag.current.pointer;
    const next = drag.current.value + (invert ? -delta : delta);
    onChange(Math.max(min, Math.min(max, next)));
  };

  const stop = (): void => {
    drag.current = null;
  };

  return (
    <div
      className={`ax-split-handle ax-split-${direction} ${className}`}
      role="separator"
      aria-label={label}
      aria-orientation={direction === 'x' ? 'vertical' : 'horizontal'}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={stop}
      onPointerCancel={stop}
    />
  );
}
