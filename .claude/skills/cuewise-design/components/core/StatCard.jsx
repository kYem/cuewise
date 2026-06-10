import React from 'react';

/**
 * Cuewise StatCard — the Insights metric tile: tinted icon chip, big value,
 * label + optional sublabel. `tint` colors the chip + value.
 */
export function StatCard({
  icon = null,
  value,
  label,
  sublabel,
  tint = 'primary',
  style = {},
}) {
  const tints = {
    primary: { chipBg: 'var(--color-primary-100)', fg: 'var(--color-primary-600)' },
    success: { chipBg: 'color-mix(in srgb, var(--color-success) 18%, transparent)', fg: 'var(--color-success)' },
    warning: { chipBg: 'color-mix(in srgb, var(--color-warning) 20%, transparent)', fg: 'var(--color-warning)' },
    error: { chipBg: 'color-mix(in srgb, var(--color-error) 16%, transparent)', fg: 'var(--color-error)' },
  };
  const t = tints[tint] || tints.primary;

  const sizedIcon =
    icon && React.isValidElement(icon)
      ? React.cloneElement(icon, { width: 22, height: 22, strokeWidth: 2, color: t.fg })
      : icon;

  return (
    <div
      style={{
        background: 'var(--color-surface-elevated)',
        border: '1px solid var(--color-border)',
        borderRadius: 'var(--radius-lg)',
        boxShadow: 'var(--shadow-lg)',
        padding: '1.25rem 1.4rem',
        fontFamily: 'var(--font-sans)',
        ...style,
      }}
    >
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '1rem' }}>
        {sizedIcon && (
          <div
            style={{
              display: 'inline-flex',
              padding: '0.55rem',
              borderRadius: 'var(--radius-md)',
              background: t.chipBg,
            }}
          >
            {sizedIcon}
          </div>
        )}
        <div
          style={{
            fontFamily: 'var(--font-display)',
            fontWeight: 700,
            fontSize: '2rem',
            lineHeight: 1,
            color: t.fg,
          }}
        >
          {value}
        </div>
      </div>
      <div style={{ marginTop: '0.9rem', fontWeight: 600, fontSize: '0.9375rem', color: 'var(--color-text-primary)' }}>
        {label}
      </div>
      {sublabel && (
        <div style={{ marginTop: '0.2rem', fontSize: '0.75rem', color: 'var(--color-text-tertiary)' }}>{sublabel}</div>
      )}
    </div>
  );
}
