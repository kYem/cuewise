import {
  Segmented,
  SettingDivider,
  SettingRow,
  type SettingsSection,
  type SettingsSectionProps,
  Switch,
} from '@cuewise/app';
import { Button, cn } from '@cuewise/ui';
import { PersonStanding } from 'lucide-react';
import { useEffect } from 'react';
import type { GlowIntensity, GlowStyle } from '../glow/glow-prefs';
import {
  calibratePosture,
  describePauseEnd,
  type NudgeDelaySeconds,
  type NudgeSensitivity,
  pausePostureNudges,
  resumePostureNudges,
  setGlowIntensity,
  setGlowStyle,
  setNudgeDelay,
  setNudgeSensitivity,
  setPostureNudges,
  setQuietHours,
  startGlowPreview,
  startPosture,
  stopGlowPreview,
  stopPosture,
  usePosture,
} from './posture-controller';
import { STATUS_META } from './status-meta';

const NUDGE_DELAY_OPTIONS: { value: `${NudgeDelaySeconds}`; label: string }[] = [
  { value: '15', label: 'Strict · 15s' },
  { value: '30', label: 'Balanced · 30s' },
  { value: '60', label: 'Gentle · 60s' },
];

const GLOW_INTENSITY_OPTIONS: { value: GlowIntensity; label: string }[] = [
  { value: 'subtle', label: 'Subtle' },
  { value: 'standard', label: 'Standard' },
  { value: 'intense', label: 'Intense' },
];

const GLOW_STYLE_OPTIONS: { value: GlowStyle; label: string }[] = [
  { value: 'glow', label: 'Glow' },
  { value: 'border', label: 'Border' },
  { value: 'tint', label: 'Tint' },
];

const SENSITIVITY_OPTIONS: { value: NudgeSensitivity; label: string }[] = [
  { value: 'strict', label: 'Strict' },
  { value: 'balanced', label: 'Balanced' },
  { value: 'relaxed', label: 'Relaxed' },
];

const TIME_INPUT_CLASS =
  'rounded border border-border bg-transparent px-1.5 py-0.5 text-xs text-primary dark:[color-scheme:dark]';

function fmt(value: number | undefined, digits = 2): string {
  if (value === undefined) {
    return '—';
  }
  return value.toFixed(digits);
}

function PostureSection({ filter }: SettingsSectionProps) {
  const {
    tracking,
    nudgesEnabled,
    sample,
    error,
    nudgesPausedUntil,
    nudgeDelaySeconds,
    glowIntensity,
    glowStyle,
    glowPreviewActive,
    nudgeSensitivity,
    quietHours,
  } = usePosture();
  const meta = sample ? STATUS_META[sample.status] : null;

  // Leaving this section (or closing Settings) always ends a running preview.
  useEffect(() => {
    return () => {
      stopGlowPreview();
    };
  }, []);

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

      {tracking ? (
        <SettingRow
          label="Sensitivity"
          help="How much lean counts. Strict flags small leans; Relaxed forgives more — sitting back never counts."
          keywords="posture sensitivity dead zone strict balanced relaxed threshold lean slouch"
          filter={filter}
        >
          <Segmented
            value={nudgeSensitivity}
            options={SENSITIVITY_OPTIONS}
            onChange={setNudgeSensitivity}
          />
        </SettingRow>
      ) : null}

      <SettingRow
        label="Remind me to fix my posture"
        help="A gentle visual cue on screen when you've been leaning in for a while — it clears once you sit back."
        keywords="posture nudge remind glow slouch reminder screen edge"
        filter={filter}
      >
        <Switch label="Posture reminders" checked={nudgesEnabled} onChange={setPostureNudges} />
      </SettingRow>

      {nudgesEnabled ? (
        <SettingRow
          label="Nudge after"
          help="How long you can lean in before the reminder appears."
          keywords="posture nudge delay threshold strict gentle seconds glow trigger"
          filter={filter}
        >
          <Segmented
            value={`${nudgeDelaySeconds}` as `${NudgeDelaySeconds}`}
            options={NUDGE_DELAY_OPTIONS}
            onChange={(value) => setNudgeDelay(Number(value) as NudgeDelaySeconds)}
          />
        </SettingRow>
      ) : null}

      {nudgesEnabled ? (
        <SettingRow
          label="Nudge style"
          help="How the reminder looks: a soft edge glow, a crisp border ring, or an even tint."
          keywords="posture nudge style glow border ring tint solid visual"
          filter={filter}
        >
          <Segmented value={glowStyle} options={GLOW_STYLE_OPTIONS} onChange={setGlowStyle} />
        </SettingRow>
      ) : null}

      {nudgesEnabled ? (
        <SettingRow
          label="Nudge strength"
          help="How present the reminder feels. Preview shows it now and stops when you leave Settings."
          keywords="posture glow border tint intensity strength subtle standard intense brightness preview test"
          filter={filter}
        >
          <div className="flex items-center gap-3">
            <Segmented
              value={glowIntensity}
              options={GLOW_INTENSITY_OPTIONS}
              onChange={setGlowIntensity}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => (glowPreviewActive ? stopGlowPreview() : startGlowPreview())}
            >
              {glowPreviewActive ? 'Stop preview' : 'Preview'}
            </Button>
          </div>
        </SettingRow>
      ) : null}

      {nudgesEnabled ? (
        <SettingRow
          label="Quiet hours"
          help="A daily window with no reminders — overnight ranges work too. Tracking keeps running."
          keywords="posture quiet hours schedule night window nudges do not disturb"
          filter={filter}
        >
          <div className="flex items-center gap-3">
            <Switch
              label="Quiet hours"
              checked={quietHours.enabled}
              onChange={(enabled) => setQuietHours({ ...quietHours, enabled })}
            />
            {quietHours.enabled ? (
              <div className="flex items-center gap-1.5 text-xs text-tertiary">
                <input
                  type="time"
                  value={quietHours.start}
                  aria-label="Quiet hours start"
                  className={TIME_INPUT_CLASS}
                  onChange={(e) => {
                    if (e.target.value !== '') {
                      setQuietHours({ ...quietHours, start: e.target.value });
                    }
                  }}
                />
                <span>–</span>
                <input
                  type="time"
                  value={quietHours.end}
                  aria-label="Quiet hours end"
                  className={TIME_INPUT_CLASS}
                  onChange={(e) => {
                    if (e.target.value !== '') {
                      setQuietHours({ ...quietHours, end: e.target.value });
                    }
                  }}
                />
              </div>
            ) : null}
          </div>
        </SettingRow>
      ) : null}

      {tracking && nudgesEnabled ? (
        <SettingRow
          label="Pause reminders"
          help="Silence the nudges for a while — posture tracking keeps running. A 10-minute snooze also lives in the menu-bar tray."
          keywords="posture pause snooze nudges quiet silence glow"
          filter={filter}
        >
          {nudgesPausedUntil !== null ? (
            <div className="flex items-center gap-3">
              <span className="text-xs text-tertiary">
                Paused {describePauseEnd(nudgesPausedUntil)}
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
