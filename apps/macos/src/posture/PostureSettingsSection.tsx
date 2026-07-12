import {
  SettingDivider,
  SettingRow,
  type SettingsSection,
  type SettingsSectionProps,
  Switch,
} from '@cuewise/app';
import type { PostureStatus } from '@cuewise/shared';
import { Button, cn } from '@cuewise/ui';
import { PersonStanding } from 'lucide-react';
import {
  calibratePosture,
  pausePostureNudges,
  resumePostureNudges,
  setPostureNudges,
  startPosture,
  stopPosture,
  usePosture,
} from './posture-controller';

const STATUS_META: Record<PostureStatus, { label: string; dot: string }> = {
  good: { label: 'Good posture', dot: 'bg-emerald-500' },
  mild: { label: 'Ease up', dot: 'bg-amber-500' },
  poor: { label: 'Sit back', dot: 'bg-rose-500' },
  absent: { label: 'No face in frame', dot: 'bg-tertiary' },
};

function fmt(value: number | undefined, digits = 2): string {
  if (value === undefined) {
    return '—';
  }
  return value.toFixed(digits);
}

function formatPausedUntil(pausedUntil: number | 'until-resume'): string {
  if (pausedUntil === 'until-resume') {
    return 'until you resume';
  }
  const at = new Date(pausedUntil).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return `until ${at}`;
}

function PostureSection({ filter }: SettingsSectionProps) {
  const { tracking, nudgesEnabled, sample, error, nudgesPausedUntil } = usePosture();
  const meta = sample ? STATUS_META[sample.status] : null;

  return (
    <div>
      <span className="mb-3 inline-flex items-center rounded-full bg-surface-variant px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-secondary">
        Beta · on-device
      </span>
      <p className="mb-4 max-w-[440px] text-xs leading-relaxed text-tertiary">
        Cuewise checks your posture on-device using the camera. Frames are analyzed in memory — no
        image is ever stored or sent.
      </p>

      <SettingRow
        label="Posture tracking"
        help="Turn on the camera for gentle, on-device posture readings while you work."
        keywords="posture camera calibrate neck slouch tracking beta wellbeing"
        filter={filter}
      >
        <Switch
          label="Posture tracking"
          checked={tracking}
          onChange={(next) => (next ? startPosture() : stopPosture())}
        />
      </SettingRow>

      <SettingRow
        label="Remind me to fix my posture"
        help="A gentle glow around the screen edge when you've been leaning in for a while — it fades once you sit back."
        keywords="posture nudge remind glow slouch reminder screen edge"
        filter={filter}
      >
        <Switch label="Posture reminders" checked={nudgesEnabled} onChange={setPostureNudges} />
      </SettingRow>

      {tracking && nudgesEnabled ? (
        <SettingRow
          label="Pause reminders"
          help="Silence the glow for a while — posture tracking keeps running. A 10-minute snooze also lives in the menu-bar tray."
          keywords="posture pause snooze nudges quiet silence glow"
          filter={filter}
        >
          {nudgesPausedUntil !== null ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-tertiary">
                Paused {formatPausedUntil(nudgesPausedUntil)}
              </span>
              <Button variant="secondary" size="sm" onClick={resumePostureNudges}>
                Resume
              </Button>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={() => pausePostureNudges(15)}>
                15 min
              </Button>
              <Button variant="secondary" size="sm" onClick={() => pausePostureNudges(60)}>
                1 hour
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => pausePostureNudges('until-resume')}
              >
                Until I resume
              </Button>
            </div>
          )}
        </SettingRow>
      ) : null}

      {tracking ? (
        <>
          <SettingDivider />
          <div className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-2.5">
              <span className={cn('h-2.5 w-2.5 rounded-full', meta?.dot ?? 'bg-tertiary')} />
              <span className="text-sm font-medium text-primary">{meta?.label ?? 'Starting…'}</span>
            </div>
            <span className="text-xs tabular-nums text-tertiary">
              neckΔ {fmt(sample?.neckDeviation, 3)} · dist {fmt(sample?.screenDistanceRatio)}
            </span>
          </div>
          <Button variant="secondary" size="sm" onClick={calibratePosture}>
            Calibrate to my posture
          </Button>
          <p className="mt-2 text-xs leading-snug text-tertiary">
            Sit how you'd like to sit, then calibrate to set that as your baseline.
          </p>
        </>
      ) : null}

      {error ? <p className="mt-3 text-xs text-error">{error}</p> : null}
    </div>
  );
}

export const PostureSettingsSection: SettingsSection = {
  id: 'posture',
  label: 'Posture',
  icon: PersonStanding,
  component: PostureSection,
  terms: 'posture camera tracking calibrate neck slouch on-device beta wellbeing health',
};
