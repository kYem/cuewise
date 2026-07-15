import {
  type ConceptCadence,
  type ConceptFraming,
  type FocusImageCategory,
  type FocusPosition,
  formatHourMinute,
  getStorage,
  NOTIFICATION_SOUNDS,
  type NotificationSoundType,
  POMODORO_DURATION_BOUNDS,
  type PomodoroCompanion,
  type QuoteDisplayMode,
  type ReminderPanelLayout,
  type SettingsLogLevel,
  type TimeFormat,
} from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import type { LucideIcon } from 'lucide-react';
import {
  ArrowRight,
  Bell,
  Headphones,
  House,
  Maximize2,
  Music,
  Play,
  RotateCcw,
  SlidersHorizontal,
  Timer,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { type SyncUiStatus, useSyncController } from '../../sync/sync-controller';
import { isCalendarFeatureEnabled } from '../../utils/google-calendar';
import { previewSound } from '../../utils/sounds';
import { PresetGrid } from './PresetGrid';
import {
  Segmented,
  SelectControl,
  SettingDivider,
  SettingRow,
  SettingSubgroup,
  Stepper,
  Switch,
} from './SettingControls';
import { quoteIntervalToSeconds } from './settings-interval';
import { settingsMatch } from './settings-match';
import type { SettingsSectionProps } from './settings-types';
import { ThumbPicker } from './ThumbPicker';
import { pomodoroWorkStep } from './timer-presets';

const SOUND_OPTIONS = Object.entries(NOTIFICATION_SOUNDS).map(([value, label]) => ({
  value,
  label,
}));

const LOG_LEVELS: { value: SettingsLogLevel; label: string }[] = [
  { value: 'none', label: 'Off' },
  { value: 'error', label: 'Errors only' },
  { value: 'warn', label: 'Warnings' },
  { value: 'info', label: 'Info' },
  { value: 'debug', label: 'Debug (verbose)' },
];

const QUOTE_DISPLAY_OPTIONS: { value: QuoteDisplayMode; label: string }[] = [
  { value: 'normal', label: 'Top' },
  { value: 'compact', label: 'Compact' },
  { value: 'bottom', label: 'Bottom' },
  { value: 'hidden', label: 'Off' },
];

const FOCUS_POSITION_OPTIONS: { value: FocusPosition; label: string }[] = [
  { value: 'top', label: 'Top' },
  { value: 'center', label: 'Center' },
  { value: 'bottom', label: 'Bottom' },
];

const TIME_FORMAT_OPTIONS: { value: TimeFormat; label: string }[] = [
  { value: '12h', label: '2:30 PM' },
  { value: '24h', label: '14:30' },
];

const REMINDER_LAYOUT_OPTIONS: { value: ReminderPanelLayout; label: string }[] = [
  { value: 'composed', label: 'Composed' },
  { value: 'agenda', label: 'Agenda' },
];

const QUOTE_UNIT_OPTIONS: { value: 'sec' | 'min'; label: string }[] = [
  { value: 'sec', label: 'sec' },
  { value: 'min', label: 'min' },
];

const CONCEPT_FRAMING_OPTIONS: { value: ConceptFraming; label: string }[] = [
  { value: 'ambient', label: 'Ambient' },
  { value: 'queue', label: 'Due queue' },
];

const CONCEPT_CADENCE_OPTIONS: { value: ConceptCadence; label: string }[] = [
  { value: 'every', label: 'Every tab' },
  { value: 'third', label: '1 in 3' },
  { value: 'ten', label: '1 in 10' },
  { value: 'off', label: 'Off' },
];

const QUOTE_INTERVALS = [
  { value: 0, label: 'Manual' },
  { value: 10, label: '10s' },
  { value: 30, label: '30s' },
  { value: 60, label: '1m' },
  { value: 300, label: '5m' },
  { value: 1800, label: '30m' },
  { value: 3600, label: '1h' },
];

function intervalLabel(seconds: number): string {
  if (seconds === 0) {
    return 'manual';
  }
  if (seconds < 60) {
    return `${seconds}s`;
  }
  if (seconds < 3600) {
    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;
    return remaining > 0 ? `${minutes}m ${remaining}s` : `${minutes}m`;
  }
  const hours = Math.floor(seconds / 3600);
  const remainingMinutes = Math.floor((seconds % 3600) / 60);
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

function hourLabel(hour: number, timeFormat: TimeFormat): string {
  if (timeFormat === '12h') {
    return formatHourMinute(hour);
  }
  return `${String(hour).padStart(2, '0')}:00`;
}

/* Timer */
function TimerSection({ s, set, filter }: SettingsSectionProps) {
  return (
    <div>
      <SettingRow
        stack
        label="Session recipe"
        filter={filter}
        help="Pick a rhythm — work · short break · long break, in minutes. Fine-tune below."
        keywords="pomodoro preset classic deep work sprint durations"
      >
        <PresetGrid s={s} onApply={set} />
      </SettingRow>
      <SettingDivider />
      <SettingRow
        label="Work duration"
        filter={filter}
        keywords="pomodoro focus session length minutes"
      >
        <Stepper
          label="work duration"
          value={s.pomodoroWorkDuration}
          min={POMODORO_DURATION_BOUNDS.pomodoroWorkDuration.min}
          max={POMODORO_DURATION_BOUNDS.pomodoroWorkDuration.max}
          step={pomodoroWorkStep(s.pomodoroWorkDuration)}
          unit="min"
          onChange={(v) => set({ pomodoroWorkDuration: v })}
        />
      </SettingRow>
      <SettingRow label="Short break" filter={filter} keywords="pomodoro break duration minutes">
        <Stepper
          label="short break"
          value={s.pomodoroBreakDuration}
          min={POMODORO_DURATION_BOUNDS.pomodoroBreakDuration.min}
          max={POMODORO_DURATION_BOUNDS.pomodoroBreakDuration.max}
          unit="min"
          onChange={(v) => set({ pomodoroBreakDuration: v })}
        />
      </SettingRow>
      <SettingRow label="Long break" filter={filter} keywords="pomodoro break duration minutes">
        <Stepper
          label="long break"
          value={s.pomodoroLongBreakDuration}
          min={POMODORO_DURATION_BOUNDS.pomodoroLongBreakDuration.min}
          max={POMODORO_DURATION_BOUNDS.pomodoroLongBreakDuration.max}
          step={5}
          unit="min"
          onChange={(v) => set({ pomodoroLongBreakDuration: v })}
        />
      </SettingRow>
      <SettingRow
        label="Long break after"
        filter={filter}
        help="Number of work sessions before a long break"
        keywords="pomodoro sessions interval"
      >
        <Stepper
          label="long break after"
          value={s.pomodoroLongBreakInterval}
          min={POMODORO_DURATION_BOUNDS.pomodoroLongBreakInterval.min}
          max={POMODORO_DURATION_BOUNDS.pomodoroLongBreakInterval.max}
          unit="sessions"
          onChange={(v) => set({ pomodoroLongBreakInterval: v })}
        />
      </SettingRow>
      {isCalendarFeatureEnabled() && (
        <>
          <SettingDivider />
          <SettingRow
            label="Companion"
            filter={filter}
            help="What shows beside the timer"
            keywords="pomodoro companion quote calendar agenda schedule beside timer up next"
          >
            <Segmented
              value={s.pomodoroCompanion}
              options={[
                { value: 'quote', label: 'Quote' },
                { value: 'calendar', label: 'Calendar' },
                { value: 'both', label: 'Both' },
              ]}
              onChange={(v) => set({ pomodoroCompanion: v as PomodoroCompanion })}
            />
          </SettingRow>
        </>
      )}
    </div>
  );
}

/* Sound & music */
function PlayButton({ sound, context }: { sound: string; context: 'start' | 'completion' }) {
  const disabled = sound === 'none';
  return (
    <button
      type="button"
      title="Preview sound"
      disabled={disabled}
      onClick={() => previewSound(sound as NotificationSoundType, context)}
      className="flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-primary transition-colors hover:bg-surface-variant disabled:opacity-40 disabled:hover:bg-surface"
    >
      <Play className="h-4 w-4" />
    </button>
  );
}

function SoundSection({ s, set, filter, onOpenSoundsPanel }: SettingsSectionProps) {
  return (
    <div>
      <SettingRow
        label="Start sound"
        filter={filter}
        help="Played when a session starts"
        keywords="notification chime bell audio"
      >
        <div className="flex items-center gap-2">
          <SelectControl
            label="Start sound"
            value={s.pomodoroStartSound}
            options={SOUND_OPTIONS}
            className="w-[130px]"
            onChange={(v) => set({ pomodoroStartSound: v })}
          />
          <PlayButton sound={s.pomodoroStartSound} context="start" />
        </div>
      </SettingRow>
      <SettingRow
        label="Completion sound"
        filter={filter}
        help="Played when a session completes — work or break"
        keywords="notification chime bell audio finish"
      >
        <div className="flex items-center gap-2">
          <SelectControl
            label="Completion sound"
            value={s.pomodoroCompletionSound}
            options={SOUND_OPTIONS}
            className="w-[130px]"
            onChange={(v) => set({ pomodoroCompletionSound: v })}
          />
          <PlayButton sound={s.pomodoroCompletionSound} context="completion" />
        </div>
      </SettingRow>
      <SettingDivider />
      <SettingRow
        label="Focus music"
        filter={filter}
        help="Play YouTube playlists during Pomodoro sessions"
        keywords="youtube playlist lofi ambient"
      >
        <Switch
          label="Focus music"
          checked={s.pomodoroMusicEnabled}
          onChange={(v) => set({ pomodoroMusicEnabled: v })}
        />
      </SettingRow>
      {s.pomodoroMusicEnabled && (
        <SettingSubgroup>
          <SettingRow
            label="Auto-start with timer"
            filter={filter}
            help="Music begins when you start a session"
            keywords="music play automatically"
          >
            <Switch
              label="Auto-start with timer"
              checked={s.pomodoroMusicAutoStart}
              onChange={(v) => set({ pomodoroMusicAutoStart: v })}
            />
          </SettingRow>
          <SettingRow
            label="Keep playing on breaks"
            filter={filter}
            keywords="music breaks continue"
          >
            <Switch
              label="Keep playing on breaks"
              checked={s.pomodoroMusicPlayDuringBreaks}
              onChange={(v) => set({ pomodoroMusicPlayDuringBreaks: v })}
            />
          </SettingRow>
          {settingsMatch(filter, 'sounds playlists configure ambient') && (
            <button
              type="button"
              onClick={onOpenSoundsPanel}
              className="my-1.5 flex items-center gap-2 rounded-lg border border-border bg-surface px-3.5 py-2 text-xs font-medium text-primary transition-colors hover:bg-surface-variant"
            >
              <Music className="h-3.5 w-3.5" />
              Sounds &amp; playlists
              <ArrowRight className="h-3 w-3 text-tertiary" />
            </button>
          )}
        </SettingSubgroup>
      )}
    </div>
  );
}

/* Focus mode */
function FocusSection({ s, set, filter }: SettingsSectionProps) {
  return (
    <div>
      <SettingRow
        label="Focus mode"
        filter={filter}
        help="Adds a fullscreen button to the timer, with scenic backgrounds"
        keywords="fullscreen scenic enable"
      >
        <Switch
          label="Focus mode"
          checked={s.focusModeEnabled}
          onChange={(v) => set({ focusModeEnabled: v })}
        />
      </SettingRow>
      <SettingSubgroup>
        <SettingRow
          stack
          label="Background"
          filter={filter}
          help="High-quality photos from Unsplash — also used as the Glass theme wallpaper"
          keywords="image category nature forest ocean mountains minimal dark glass wallpaper"
        >
          <ThumbPicker
            value={s.focusModeImageCategory}
            onChange={(v: FocusImageCategory) => set({ focusModeImageCategory: v })}
          />
        </SettingRow>
      </SettingSubgroup>
      {s.focusModeEnabled && (
        <SettingSubgroup>
          <SettingRow label="Show quote" filter={filter} keywords="quote overlay focus">
            <Switch
              label="Show quote"
              checked={s.focusModeShowQuote}
              onChange={(v) => set({ focusModeShowQuote: v })}
            />
          </SettingRow>
          <SettingRow
            label="Show current goal"
            filter={filter}
            help="Your next task under the timer — tick it off without leaving focus."
            keywords="goal task focusing progress complete"
          >
            <Switch
              label="Show current goal"
              checked={s.focusModeShowGoal}
              onChange={(v) => set({ focusModeShowGoal: v })}
            />
          </SettingRow>
          <SettingRow
            label="Auto-enter on start"
            filter={filter}
            help="Enter focus mode whenever a work session starts"
            keywords="automatic fullscreen"
          >
            <Switch
              label="Auto-enter on start"
              checked={s.focusModeAutoEnter}
              onChange={(v) => set({ focusModeAutoEnter: v })}
            />
          </SettingRow>
        </SettingSubgroup>
      )}
    </div>
  );
}

/* Custom quote-interval editor (clamped 10s–1h) */
type QuoteIntervalProps = Pick<SettingsSectionProps, 's' | 'set' | 'filter'>;

function QuoteIntervalControl({ s, set, filter }: QuoteIntervalProps) {
  const interval = s.quoteChangeInterval;
  const isPreset = QUOTE_INTERVALS.some((option) => option.value === interval);
  const [customOpen, setCustomOpen] = useState(!isPreset);
  const [unit, setUnit] = useState<'sec' | 'min'>(
    interval >= 60 && interval % 60 === 0 ? 'min' : 'sec'
  );
  const showCustom = customOpen || !isPreset;
  const display = unit === 'min' ? Math.round(interval / 60) : interval;

  const commit = (raw: string) => {
    const seconds = quoteIntervalToSeconds(raw, unit);
    if (seconds !== null) {
      set({ quoteChangeInterval: seconds });
    }
  };

  return (
    <>
      <SettingRow
        stack
        label="New quote every"
        filter={filter}
        help="Manual means quotes change only when you tap refresh"
        keywords="quote interval rotate refresh auto change custom seconds minutes"
      >
        <div className="flex flex-wrap gap-2">
          {QUOTE_INTERVALS.map((option) => {
            const active = !showCustom && interval === option.value;
            return (
              <button
                key={option.value}
                type="button"
                onClick={() => {
                  setCustomOpen(false);
                  set({ quoteChangeInterval: option.value });
                }}
                className={chipClass(active)}
              >
                {option.label}
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setCustomOpen(true)}
            className={chipClass(showCustom)}
          >
            Custom…
          </button>
        </div>
      </SettingRow>
      {showCustom && (
        <SettingSubgroup>
          <SettingRow
            label={`Custom interval — every ${intervalLabel(interval)}`}
            filter={filter}
            help="Anything from 10 seconds to 1 hour"
            keywords="custom interval seconds minutes"
          >
            <div className="flex items-center gap-2">
              <input
                key={`${unit}:${interval}`}
                type="number"
                min={unit === 'min' ? 1 : 10}
                max={unit === 'min' ? 60 : 3600}
                defaultValue={display}
                onBlur={(e) => commit(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    commit((e.target as HTMLInputElement).value);
                  }
                }}
                className="w-20 rounded-lg border border-border bg-surface px-3 py-2 text-center text-sm font-medium text-primary focus:outline-none focus:ring-2 focus:ring-primary-500"
              />
              <Segmented value={unit} onChange={setUnit} options={QUOTE_UNIT_OPTIONS} />
            </div>
          </SettingRow>
        </SettingSubgroup>
      )}
    </>
  );
}

function chipClass(active: boolean): string {
  return cn(
    'rounded-full border px-3 py-1.5 text-xs font-medium transition-colors',
    active
      ? 'border-transparent bg-primary-600 text-white'
      : 'border-border bg-surface text-secondary hover:bg-surface-variant hover:text-primary'
  );
}

/* Home screen */
function HomeSection({ s, set, filter }: SettingsSectionProps) {
  const quotesVisible = s.quoteDisplayMode !== 'hidden';
  const goalsPositionVisible = s.quoteDisplayMode === 'bottom' || s.quoteDisplayMode === 'hidden';

  return (
    <div>
      <SettingRow
        label="Clock"
        filter={filter}
        help="Time, date, and greeting on the home page"
        keywords="time date greeting show"
      >
        <Switch label="Clock" checked={s.showClock} onChange={(v) => set({ showClock: v })} />
      </SettingRow>
      {s.showClock && (
        <SettingSubgroup>
          <SettingRow label="Time format" filter={filter} keywords="12 hour 24 hour clock am pm">
            <Segmented
              value={s.timeFormat}
              onChange={(v) => set({ timeFormat: v })}
              options={TIME_FORMAT_OPTIONS}
            />
          </SettingRow>
        </SettingSubgroup>
      )}
      <SettingRow
        label="Quick links"
        filter={filter}
        help="Pinned shortcut tiles in the top-left of the home page"
        keywords="shortcut bookmark favicon links tiles pinned sites"
      >
        <Switch
          label="Quick links"
          checked={s.showQuickLinks}
          onChange={(v) => set({ showQuickLinks: v })}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow
        label="Quote display"
        filter={filter}
        help="Where quotes appear on the home page"
        keywords="quotes position normal compact bottom hidden"
      >
        <Segmented
          value={s.quoteDisplayMode}
          options={QUOTE_DISPLAY_OPTIONS}
          onChange={(v) => set({ quoteDisplayMode: v })}
        />
      </SettingRow>
      {goalsPositionVisible && (
        <SettingRow
          label="Goals position"
          filter={filter}
          help="Vertical position of the goals section"
          keywords="focus position layout top center bottom"
        >
          <Segmented
            value={s.focusPosition}
            options={FOCUS_POSITION_OPTIONS}
            onChange={(v) => set({ focusPosition: v })}
          />
        </SettingRow>
      )}
      {quotesVisible && (
        <>
          <QuoteIntervalControl s={s} set={set} filter={filter} />
          <SettingRow
            label="Animate transitions"
            filter={filter}
            help="Slot-machine style animation when quotes change"
            keywords="quote animation motion"
          >
            <Switch
              label="Animate transitions"
              checked={s.enableQuoteAnimation}
              onChange={(v) => set({ enableQuoteAnimation: v })}
            />
          </SettingRow>
        </>
      )}
      <SettingDivider />
      <SettingRow
        label="Concept cards"
        filter={filter}
        help="Resurface saved concepts for spaced-repetition review on the new tab"
        keywords="recall spaced repetition flashcards concepts learning definitions"
      >
        <Switch
          label="Concept cards"
          checked={s.conceptCardsEnabled}
          onChange={(v) => set({ conceptCardsEnabled: v })}
        />
      </SettingRow>
      {s.conceptCardsEnabled && (
        <SettingSubgroup>
          <SettingRow
            label="Surfacing"
            filter={filter}
            help="Calmly mix one in (ambient), or clear a due pile (queue)"
            keywords="ambient queue surfacing framing"
          >
            <Segmented
              value={s.conceptFraming}
              options={CONCEPT_FRAMING_OPTIONS}
              onChange={(v) => set({ conceptFraming: v })}
            />
          </SettingRow>
          <SettingRow
            label="How often"
            filter={filter}
            help="How often a due card appears in the rotation"
            keywords="cadence frequency how often tabs"
          >
            <Segmented
              value={s.conceptCadence}
              options={CONCEPT_CADENCE_OPTIONS}
              onChange={(v) => set({ conceptCadence: v })}
            />
          </SettingRow>
          <SettingRow
            label="Active recall"
            filter={filter}
            help="Hide the definition until you reveal it"
            keywords="active recall reveal grade quiz definition"
          >
            <Switch
              label="Active recall"
              checked={s.conceptActiveRecall}
              onChange={(v) => set({ conceptActiveRecall: v })}
            />
          </SettingRow>
        </SettingSubgroup>
      )}
    </div>
  );
}

/* Goals & alerts */
function GoalsSection({ s, set, filter }: SettingsSectionProps) {
  return (
    <div>
      <SettingRow
        label="Notifications"
        filter={filter}
        help="When sessions complete and reminders are due"
        keywords="browser notify alerts reminders"
      >
        <Switch
          label="Notifications"
          checked={s.enableNotifications}
          onChange={(v) => set({ enableNotifications: v })}
        />
      </SettingRow>
      <SettingRow
        label="Reminders layout"
        filter={filter}
        help="How the reminders panel is arranged — Composed (habits + timeline) or Agenda (time rail)"
        keywords="reminders layout composed agenda timeline panel habits"
      >
        <Segmented
          value={s.reminderPanelLayout}
          options={REMINDER_LAYOUT_OPTIONS}
          onChange={(v) => set({ reminderPanelLayout: v })}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow
        label="Celebrate completions"
        filter={filter}
        help="A short animation when you finish a session or all of today's goals"
        keywords="confetti celebration animation wins"
      >
        <Switch
          label="Celebrate completions"
          checked={s.celebrationsEnabled}
          onChange={(v) => set({ celebrationsEnabled: v })}
        />
      </SettingRow>
      <SettingDivider />
      <SettingRow
        label="Carry goals to tomorrow"
        filter={filter}
        help="Offer to move incomplete goals to tomorrow after your end of day"
        keywords="goal transfer incomplete move"
      >
        <Switch
          label="Carry goals to tomorrow"
          checked={s.enableGoalTransfer}
          onChange={(v) => set({ enableGoalTransfer: v })}
        />
      </SettingRow>
      {s.enableGoalTransfer && (
        <SettingSubgroup>
          <SettingRow
            label="End of day"
            filter={filter}
            help="The carry-over option appears on incomplete goals after this time"
            keywords="time evening schedule"
          >
            <SelectControl
              label="End of day"
              value={String(s.goalTransferTime)}
              className="w-[120px]"
              options={Array.from({ length: 24 }, (_, i) => ({
                value: String(i),
                label: hourLabel(i, s.timeFormat),
              }))}
              onChange={(v) => set({ goalTransferTime: Number(v) })}
            />
          </SettingRow>
        </SettingSubgroup>
      )}
      <SettingDivider />
      <SettingRow
        label="Auto-roll due tasks"
        filter={filter}
        help="Move incomplete tasks into Today when their due date arrives"
        keywords="due date deadline overdue roll today automatic"
      >
        <Switch
          label="Auto-roll due tasks"
          checked={s.autoRollDueTasks}
          onChange={(v) => set({ autoRollDueTasks: v })}
        />
      </SettingRow>
    </div>
  );
}

/* Advanced */
function AdvancedSection({ s, set, filter, onReset }: SettingsSectionProps) {
  const [confirming, setConfirming] = useState(false);
  const syncController = useSyncController();
  const [syncStatus, setSyncStatus] = useState<SyncUiStatus>(
    () => syncController?.getStatus() ?? 'off'
  );

  useEffect(() => {
    if (!confirming) {
      return undefined;
    }
    const timeout = setTimeout(() => setConfirming(false), 3500);
    return () => clearTimeout(timeout);
  }, [confirming]);

  useEffect(() => {
    if (!syncController) {
      return undefined;
    }
    setSyncStatus(syncController.getStatus());
    return syncController.subscribe(setSyncStatus);
  }, [syncController]);

  const handleResetClick = () => {
    if (confirming) {
      onReset();
      setConfirming(false);
    } else {
      setConfirming(true);
    }
  };

  // Chrome sync rides on chrome.storage.sync; local-only backends (the macOS app,
  // dev/web) have no sync area, so hide the toggle rather than show an inert one.
  const syncSupported = getStorage().supportsSync;
  // Gate the legacy Chrome-sync toggle whenever Cloud Sync is not off — in error/needs_reauth it's
  // still enrolled and owns local storage, so the two systems must never fight over it.
  const syncManagedByCloudSync = syncController !== null && syncStatus !== 'off';

  return (
    <div>
      {syncSupported && (
        <SettingRow
          label="Chrome sync"
          filter={filter}
          help="Sync custom quotes, goals, and reminders across browsers where you're signed in. Built-in quotes stay local; sync is limited to 100KB total and 8KB per item."
          keywords="chrome sync cloud cross device storage"
        >
          <Switch
            label="Chrome sync"
            checked={s.syncEnabled}
            disabled={syncManagedByCloudSync}
            onChange={(v) => set({ syncEnabled: v })}
          />
        </SettingRow>
      )}
      {syncSupported && syncManagedByCloudSync && (
        <p className="-mt-1 mb-2 text-xs text-tertiary">Managed by Cloud Sync</p>
      )}
      <SettingRow
        label="Console logs"
        filter={filter}
        help="What appears in the developer console. Higher levels include all lower ones."
        keywords="debug log level developer verbose"
      >
        <SelectControl
          label="Console logs"
          value={s.logLevel}
          options={LOG_LEVELS}
          className="w-[170px]"
          onChange={(v) => set({ logLevel: v })}
        />
      </SettingRow>
      <SettingDivider />
      {settingsMatch(filter, 'reset defaults restore') && (
        <div className="flex min-h-[40px] items-center justify-between gap-6 py-3">
          <div className="flex min-w-0 flex-col gap-1">
            <span className="text-sm font-medium text-primary">Reset all settings</span>
            <span className="text-xs leading-snug text-tertiary">
              Restores every setting to its default value
            </span>
          </div>
          <button
            type="button"
            onClick={handleResetClick}
            className={cn(
              'flex flex-none items-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-semibold transition-colors',
              confirming
                ? 'border-error bg-error text-white'
                : 'border-border bg-surface text-error hover:bg-surface-variant'
            )}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            {confirming ? 'Tap again to confirm' : 'Reset to defaults'}
          </button>
        </div>
      )}
    </div>
  );
}

/** Section identifiers, also the routing keys for the sidebar nav. */
export const SECTION_IDS = ['timer', 'sound', 'focus', 'home', 'goals', 'advanced'] as const;
// The built-in sections' nav keys (module-internal; hosts may use any string id).
type BuiltInSectionId = (typeof SECTION_IDS)[number];

export interface SettingsSection {
  // Open union: the built-in literals stay as autocomplete suggestions, but any host id
  // (e.g. macOS "posture") is accepted too — `& {}` just stops the union collapsing to
  // plain `string`. Typos aren't caught here (every string is valid); that's enforced on
  // SETTINGS_SECTIONS below, whose element id must be a BuiltInSectionId.
  id: BuiltInSectionId | (string & {});
  label: string;
  icon: LucideIcon;
  component: React.FC<SettingsSectionProps>;
  /** Search terms that surface this section. */
  terms: string;
}

// Built-in sections: the tighter `id: BuiltInSectionId` element type makes a mistyped
// id a compile error here (the open SettingsSection.id can't catch that by design).
export const SETTINGS_SECTIONS: (SettingsSection & { id: BuiltInSectionId })[] = [
  {
    id: 'timer',
    label: 'Timer',
    icon: Timer,
    component: TimerSection,
    terms:
      'timer pomodoro work duration short break long break sessions recipe preset classic deep sprint custom minutes',
  },
  {
    id: 'sound',
    label: 'Sound & music',
    icon: Headphones,
    component: SoundSection,
    terms:
      'sound music start completion chime bell digital gentle youtube playlist lofi ambient breaks',
  },
  {
    id: 'focus',
    label: 'Focus mode',
    icon: Maximize2,
    component: FocusSection,
    terms:
      'focus mode fullscreen background nature forest ocean mountains minimal dark quote auto enter scenic',
  },
  {
    id: 'home',
    label: 'Home screen',
    icon: House,
    component: HomeSection,
    terms:
      'home screen clock time format 12 24 quote display compact bottom hidden goals position interval rotate animate concept cards recall spaced repetition flashcards learning definitions surfacing cadence',
  },
  {
    id: 'goals',
    label: 'Goals & alerts',
    icon: Bell,
    component: GoalsSection,
    terms:
      'goals alerts notifications celebrate completions carry transfer tomorrow end of day reminders layout composed agenda timeline panel',
  },
  {
    id: 'advanced',
    label: 'Advanced',
    icon: SlidersHorizontal,
    component: AdvancedSection,
    terms: 'advanced chrome sync cloud console logs debug level reset defaults restore',
  },
];
