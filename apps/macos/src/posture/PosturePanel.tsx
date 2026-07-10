import { logger, type PostureSample, type PostureStatus } from '@cuewise/shared';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { type CSSProperties, type ReactElement, useEffect, useState } from 'react';

// Opt-in posture readout for the macOS app: enables the on-device sidecar, shows
// its live PostureSample stream, and lets you calibrate/stop. A thin slice panel
// to prove the pipeline; a real feature would fold this into settings/insights.

const STATUS_META: Record<PostureStatus, { label: string; color: string }> = {
  good: { label: 'Good posture', color: '#16a34a' },
  mild: { label: 'Ease up', color: '#f59e0b' },
  poor: { label: 'Sit back', color: '#dc2626' },
  absent: { label: 'No face in frame', color: '#6b7280' },
};

function fmt(value: number | undefined, digits = 2): string {
  if (value === undefined) {
    return '—';
  }
  return value.toFixed(digits);
}

function buttonStyle(background: string): CSSProperties {
  return {
    flex: 1,
    padding: '6px 10px',
    border: 'none',
    borderRadius: 8,
    background,
    color: '#fff',
    fontSize: 12,
    cursor: 'pointer',
  };
}

export function PosturePanel(): ReactElement {
  const [tracking, setTracking] = useState(false);
  const [sample, setSample] = useState<PostureSample | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!tracking) {
      return;
    }
    const sampleSub = listen<string>('posture://sample', (event) => {
      try {
        setSample(JSON.parse(event.payload) as PostureSample);
      } catch (parseError) {
        logger.error('Failed to parse posture sample', parseError);
      }
    });
    const stoppedSub = listen('posture://stopped', () => {
      setTracking(false);
      setSample(null);
      setError('Posture tracking stopped — camera unavailable or permission denied.');
    });
    return () => {
      sampleSub.then((un) => un()).catch((e) => logger.error('unlisten posture sample failed', e));
      stoppedSub.then((un) => un()).catch((e) => logger.error('unlisten posture stop failed', e));
    };
  }, [tracking]);

  function start(): void {
    setError(null);
    invoke('start_posture')
      .then(() => setTracking(true))
      .catch((startError) => {
        logger.error('Failed to start posture tracking', startError);
        setError('Could not start posture tracking.');
      });
  }

  function stop(): void {
    invoke('stop_posture').catch((stopError) =>
      logger.error('Failed to stop posture tracking', stopError)
    );
    setTracking(false);
    setSample(null);
  }

  function calibrate(): void {
    invoke('calibrate_posture').catch((calError) =>
      logger.error('Failed to calibrate posture', calError)
    );
  }

  const meta = sample ? STATUS_META[sample.status] : null;

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 16,
        left: 16,
        zIndex: 9999,
        width: 240,
        padding: 14,
        borderRadius: 12,
        background: 'rgba(17,24,39,0.92)',
        color: '#f9fafb',
        font: '12px/1.5 -apple-system, system-ui, sans-serif',
        boxShadow: '0 8px 24px rgba(0,0,0,0.35)',
        backdropFilter: 'blur(8px)',
      }}
    >
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          marginBottom: 8,
        }}
      >
        <strong style={{ fontSize: 12, letterSpacing: 0.3 }}>Posture</strong>
        <span style={{ fontSize: 10, color: '#9ca3af' }}>beta · on-device</span>
      </div>

      {tracking ? (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
            <span
              style={{
                width: 10,
                height: 10,
                borderRadius: '50%',
                background: meta?.color ?? '#6b7280',
                display: 'inline-block',
              }}
            />
            <span style={{ fontWeight: 600 }}>{meta?.label ?? 'Starting…'}</span>
          </div>
          <div style={{ color: '#d1d5db', marginBottom: 10 }}>
            neckΔ {fmt(sample?.neckDeviation, 3)} · distance {fmt(sample?.screenDistanceRatio)} ·
            tilt {fmt(sample?.headTiltDegrees, 1)}°
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={calibrate} style={buttonStyle('#2563eb')}>
              Calibrate
            </button>
            <button type="button" onClick={stop} style={buttonStyle('#4b5563')}>
              Stop
            </button>
          </div>
        </>
      ) : (
        <>
          <p style={{ color: '#9ca3af', margin: '0 0 10px' }}>
            Opt-in posture check. Frames are analyzed on-device — no image is stored or sent.
          </p>
          <button type="button" onClick={start} style={buttonStyle('#2563eb')}>
            Enable posture tracking
          </button>
        </>
      )}

      {error ? <p style={{ color: '#fca5a5', margin: '8px 0 0' }}>{error}</p> : null}
    </div>
  );
}
