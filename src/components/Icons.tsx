import type { ReactNode } from 'react';

const paths: Record<string, ReactNode> = {
  play: <><path d="M8 5.5v13l11-6.5z" fill="currentColor" stroke="none" /></>,
  pause: <><path d="M8 5.5h3.2v13H8zM13.2 5.5h3.2v13h-3.2z" fill="currentColor" stroke="none" /></>,
  back: <><path d="M15.5 6 8.5 12l7 6M8.5 6v12" /></>,
  forward: <><path d="M8.5 6l7 6-7 6M15.5 6v12" /></>,
  plus: <><path d="M12 5v14M5 12h14" /></>,
  close: <><path d="m6 6 12 12M18 6 6 18" /></>,
  edit: <><path d="m5 16-.7 4.2 4.2-.7L19 9a2.2 2.2 0 0 0-3.1-3.1L5 16Z" /><path d="m14.5 7.5 2.7 2.7" /></>,
  grid: <><rect x="4" y="4" width="6" height="6" rx="1" /><rect x="14" y="4" width="6" height="6" rx="1" /><rect x="4" y="14" width="6" height="6" rx="1" /><rect x="14" y="14" width="6" height="6" rx="1" /></>,
  template: <><path d="M4 6.5h7v11H4zM14 6.5h6v4h-6zM14 14h6v3.5h-6z" /></>,
  compass: <><circle cx="12" cy="12" r="8.5" /><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z" /></>,
  download: <><path d="M12 4v11m0 0 4-4m-4 4-4-4M5 19h14" /></>,
  arrow: <><path d="M5 12h14m0 0-5-5m5 5-5 5" /></>,
  enter: <><path d="M7 5v9h10m0 0-4-4m4 4-4 4" /></>,
  chevron: <><path d="m8 10 4 4 4-4" /></>,
  spark: <><path d="M12 3.5 13.8 9l5.7 1.7-5.7 1.8-1.8 5.5-1.8-5.5L4.5 10.7 10.2 9 12 3.5Z" /></>,
  reset: <><path d="M5.5 8.5A7 7 0 1 1 5 14M5.5 8.5V4m0 4.5h4.5" /></>,
  trash: <><path d="M5 7h14M9 7V4.5h6V7m2 0-.7 12h-8.6L7 7" /></>,
  copy: <><rect x="8.5" y="8.5" width="10" height="10" rx="1.6" /><path d="M15.5 8.5V5.6A1.6 1.6 0 0 0 13.9 4H5.6A1.6 1.6 0 0 0 4 5.6v8.3a1.6 1.6 0 0 0 1.6 1.6h2.9" /></>,
  check: <><path d="m5 12.5 4.3 4.2L19 7" /></>,
  eye: <><path d="M2.8 12S6 5.8 12 5.8 21.2 12 21.2 12 18 18.2 12 18.2 2.8 12 2.8 12Z" /><circle cx="12" cy="12" r="2.8" /></>,
  keyboard: <><rect x="3" y="6" width="18" height="12" rx="2" /><path d="M7 10h.01M10 10h.01M13 10h.01M16 10h.01M7 13h.01M10 13h.01M13 13h.01M16 13h.01M8 16h8" /></>,
  function: <><path d="M14.5 4.5h-2A2.5 2.5 0 0 0 10 7v11m-3-9h7M4.5 20 19 4" /></>,
  layers: <><path d="m12 3.5 9 4.5-9 4.5L3 8l9-4.5Z" /><path d="m5 12 7 3.5L19 12M5 16l7 3.5L19 16" /></>,
  book: <><path d="M5 4.5h9.5A2.5 2.5 0 0 1 17 7v12.5H7.5A2.5 2.5 0 0 1 5 17V4.5Z" /><path d="M5 17a2.5 2.5 0 0 1 2.5-2.5H17M9 8h4" /></>,
  fork: <><circle cx="6" cy="5.5" r="2"/><circle cx="18" cy="5.5" r="2"/><circle cx="12" cy="18.5" r="2"/><path d="M8 5.5h8M7 7.3l4 9.2M17 7.3l-4 9.2"/></>,
  code: <><path d="m9 7-5 5 5 5M15 7l5 5-5 5" /></>,
  sun: <><circle cx="12" cy="12" r="3.6" /><path d="M12 3v2M12 19v2M3 12h2M19 12h2M5.6 5.6l1.4 1.4M17 17l1.4 1.4M18.4 5.6 17 7M7 17l-1.4 1.4" /></>,
  moon: <><path d="M20 15.2A8.2 8.2 0 0 1 8.8 4a8.2 8.2 0 1 0 11.2 11.2Z" /></>,
  terminal: <><path d="m5 7 4 5-4 5M11.5 17H19" /><rect x="3" y="4" width="18" height="16" rx="1" /></>,
  table: <><rect x="3.5" y="4.5" width="17" height="15" rx="1" /><path d="M3.5 9.5h17M9 9.5v10M15 9.5v10" /></>,
  stop: <><rect x="6.5" y="6.5" width="11" height="11" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M12 3.5v2M12 18.5v2M3.5 12h2M18.5 12h2M5.8 5.8l1.4 1.4M16.8 16.8l1.4 1.4M18.2 5.8l-1.4 1.4M7.2 16.8l-1.4 1.4" /></>,
  panel: <><rect x="3.5" y="4.5" width="17" height="15" rx="1" /><path d="M9 4.5v15" /></>,
  stepBack: <><path d="M6.5 5.5v13M18 6.5 10.5 12 18 17.5Z" /></>,
  stepForward: <><path d="M17.5 5.5v13M6 6.5l7.5 5.5L6 17.5Z" /></>,
  rewind: <><path d="M5 6v12M19 6l-8 6 8 6V6ZM11 6l-5 6 5 6V6Z" /></>,
  fastForward: <><path d="M19 6v12M5 6l8 6-8 6V6ZM13 6l5 6-5 6V6Z" /></>,
};

interface IconProps {
  name: string;
  size?: number;
  strokeWidth?: number;
  className?: string;
}

export function Icon({ name, size = 18, strokeWidth = 1.7, className = '' }: IconProps) {
  return (
    <svg
      className={`icon ${className}`}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name] || paths.grid}
    </svg>
  );
}

export function BrandMark() {
  return (
    <svg viewBox="0 0 34 34" className="brand-mark" aria-hidden="true">
      <path d="M8 7H4.5v20H8M26 7h3.5v20H26" fill="none" stroke="currentColor" strokeWidth="1.5" />
      {Array.from({ length: 3 }).map((_, r) =>
        Array.from({ length: 3 }).map((__, c) => (
          <rect
            key={`${r}-${c}`}
            x={9.5 + c * 5.2}
            y={10 + r * 5.2}
            width="3.4"
            height="3.4"
            rx=".7"
            fill="currentColor"
            opacity={r === 1 && c === 1 ? 1 : 0.35 + (r + c) * 0.09}
          />
        )),
      )}
    </svg>
  );
}
