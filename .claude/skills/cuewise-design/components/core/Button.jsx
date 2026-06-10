import React from 'react';

/**
 * Cuewise Button — pill-friendly action button.
 * Variants: primary (violet), secondary (surface), ghost (transparent), danger.
 * Sizes: sm / md / lg. Optional leading/trailing icon (Lucide element).
 */
export function Button({
  variant = 'primary',
  size = 'md',
  icon = null,
  iconRight = null,
  rounded = 'lg',
  fullWidth = false,
  disabled = false,
  children,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { padding: '0.4rem 0.85rem', fontSize: '0.8125rem', gap: '0.4rem', icon: 16 },
    md: { padding: '0.6rem 1.1rem', fontSize: '0.9375rem', gap: '0.5rem', icon: 18 },
    lg: { padding: '0.75rem 1.5rem', fontSize: '1rem', gap: '0.5rem', icon: 20 },
  };
  const s = sizes[size] || sizes.md;

  const variants = {
    primary: {
      background: 'var(--color-primary-600)',
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-md)',
    },
    secondary: {
      background: 'var(--color-surface)',
      color: 'var(--color-text-primary)',
      border: '1px solid var(--color-border)',
      boxShadow: 'var(--shadow-sm)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--color-text-secondary)',
      border: '1px solid transparent',
      boxShadow: 'none',
    },
    danger: {
      background: 'var(--color-error)',
      color: '#fff',
      border: '1px solid transparent',
      boxShadow: 'var(--shadow-md)',
    },
  };
  const v = variants[variant] || variants.primary;

  const radii = { lg: 'var(--radius-md)', xl: 'var(--radius-lg)', full: 'var(--radius-full)' };

  const [hover, setHover] = React.useState(false);
  const hoverBg = {
    primary: 'var(--color-primary-700)',
    secondary: 'var(--color-surface-variant)',
    ghost: 'var(--color-surface-variant)',
    danger: 'var(--color-primary-700)',
  };

  const sizedIcon = (el) =>
    el && React.isValidElement(el)
      ? React.cloneElement(el, { width: s.icon, height: s.icon, strokeWidth: 2 })
      : el;

  return (
    <button
      type="button"
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: s.gap,
        fontFamily: 'var(--font-sans)',
        fontWeight: 500,
        fontSize: s.fontSize,
        lineHeight: 1,
        padding: s.padding,
        width: fullWidth ? '100%' : undefined,
        borderRadius: radii[rounded] || radii.lg,
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.5 : 1,
        transition: 'background var(--duration-fast) ease, box-shadow var(--duration-fast) ease, transform var(--duration-fast) ease',
        ...v,
        background: hover && !disabled ? hoverBg[variant] : v.background,
        ...style,
      }}
      {...rest}
    >
      {sizedIcon(icon)}
      {children}
      {sizedIcon(iconRight)}
    </button>
  );
}
