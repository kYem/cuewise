import React from 'react';

/**
 * Cuewise Toggle — pill switch used across Settings. Track turns violet when on.
 */
export function Toggle({ checked = false, onChange, disabled = false, size = 'md', style = {} }) {
  const sizes = {
    sm: { w: 36, h: 20, knob: 14 },
    md: { w: 44, h: 24, knob: 18 },
  };
  const s = sizes[size] || sizes.md;
  const pad = (s.h - s.knob) / 2;

  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => !disabled && onChange && onChange(!checked)}
      style={{
        position: 'relative',
        width: s.w,
        height: s.h,
        flexShrink: 0,
        border: 'none',
        borderRadius: 'var(--radius-full)',
        padding: 0,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        background: checked ? 'var(--color-primary-600)' : 'var(--color-border)',
        transition: 'background var(--duration-fast) ease',
        ...style,
      }}
    >
      <span
        style={{
          position: 'absolute',
          top: pad,
          left: checked ? s.w - s.knob - pad : pad,
          width: s.knob,
          height: s.knob,
          borderRadius: '50%',
          background: '#fff',
          boxShadow: 'var(--shadow-sm)',
          transition: 'left var(--duration-fast) var(--ease-out)',
        }}
      />
    </button>
  );
}
