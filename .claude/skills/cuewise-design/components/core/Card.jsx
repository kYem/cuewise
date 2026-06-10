import React from 'react';

/**
 * Cuewise Card — the signature floating panel: rounded-2xl, soft shadow,
 * hairline border, optional frosted translucency so the gradient glows through.
 */
export function Card({
  frosted = false,
  padding = 'lg',
  radius = 'xl',
  hover = false,
  style = {},
  children,
  ...rest
}) {
  const pads = { sm: '1rem', md: '1.25rem', lg: '1.5rem', xl: '2rem' };
  const radii = { lg: 'var(--radius-lg)', xl: 'var(--radius-xl)', '2xl': 'var(--radius-2xl)' };
  const [isHover, setHover] = React.useState(false);

  return (
    <div
      onMouseEnter={() => hover && setHover(true)}
      onMouseLeave={() => hover && setHover(false)}
      style={{
        background: frosted
          ? 'color-mix(in srgb, var(--color-surface) 80%, transparent)'
          : 'var(--color-surface-elevated)',
        backdropFilter: frosted ? 'blur(8px)' : undefined,
        border: '1px solid var(--color-border)',
        borderRadius: radii[radius] || radii.xl,
        boxShadow: isHover ? 'var(--shadow-xl)' : 'var(--shadow-lg)',
        padding: pads[padding] || pads.lg,
        transition: 'box-shadow var(--duration-fast) ease, transform var(--duration-fast) ease',
        transform: isHover ? 'translateY(-2px)' : 'none',
        ...style,
      }}
      {...rest}
    >
      {children}
    </div>
  );
}
