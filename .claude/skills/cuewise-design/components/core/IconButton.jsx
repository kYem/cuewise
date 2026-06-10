import React from 'react';

/**
 * Cuewise IconButton — circular, translucent-surface icon button used for
 * floating nav, quote actions, timer controls. Icon is a Lucide element.
 */
export function IconButton({
  icon,
  size = 'md',
  variant = 'surface',
  active = false,
  disabled = false,
  title,
  style = {},
  ...rest
}) {
  const sizes = {
    sm: { box: 34, icon: 16 },
    md: { box: 42, icon: 20 },
    lg: { box: 48, icon: 22 },
  };
  const s = sizes[size] || sizes.md;
  const [hover, setHover] = React.useState(false);

  const variants = {
    surface: {
      background: 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
      color: 'var(--color-text-primary)',
      hoverBg: 'var(--color-surface)',
    },
    primary: {
      background: 'var(--color-primary-600)',
      color: '#fff',
      hoverBg: 'var(--color-primary-700)',
    },
    favorite: {
      background: active ? 'var(--color-error)' : 'color-mix(in srgb, var(--color-surface) 60%, transparent)',
      color: active ? '#fff' : 'var(--color-text-secondary)',
      hoverBg: active ? 'var(--color-error)' : 'var(--color-surface)',
    },
  };
  const v = variants[variant] || variants.surface;

  const sizedIcon = React.isValidElement(icon)
    ? React.cloneElement(icon, {
        width: s.icon,
        height: s.icon,
        strokeWidth: 2,
        fill: variant === 'favorite' && active ? 'currentColor' : 'none',
      })
    : icon;

  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: s.box,
        height: s.box,
        borderRadius: 'var(--radius-full)',
        border: 'none',
        boxShadow: variant === 'surface' ? 'var(--shadow-md)' : 'var(--shadow-sm)',
        backdropFilter: 'blur(6px)',
        cursor: disabled ? 'not-allowed' : 'pointer',
        opacity: disabled ? 0.4 : 1,
        transition: 'background var(--duration-fast) ease, transform var(--duration-fast) ease, box-shadow var(--duration-fast) ease',
        transform: hover && !disabled ? 'scale(1.08)' : 'scale(1)',
        background: hover && !disabled ? v.hoverBg : v.background,
        color: v.color,
        ...style,
      }}
      {...rest}
    >
      {sizedIcon}
    </button>
  );
}
