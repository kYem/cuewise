import {
  getSessionLabel,
  type SessionType,
  usePomodoroStore,
  useReminderStore,
} from '@cuewise/app';
import {
  calculateFocusTimeToday,
  countFocusSessionsToday,
  formatTimeRemaining,
  logger,
  type PostureStatus,
} from '@cuewise/shared';
import { getPomodoroSessions } from '@cuewise/storage';
import { invoke } from '@tauri-apps/api/core';
import { listen } from '@tauri-apps/api/event';
import { useEffect } from 'react';
import {
  describePauseEnd,
  pausePostureNudges,
  resumePostureNudges,
  usePosture,
} from '../posture/posture-controller';

/**
 * Projects the (single-webview) Pomodoro + reminder + posture state onto the
 * native menu-bar tray: the live timer as the title, a rebuilt menu with status
 * lines + controls. Menu clicks come back as `tray://action` events and dispatch
 * into the Pomodoro store / posture controller. Mounted from main.tsx under Tauri.
 */

type TrayAction = { id: string; label: string };

const SESSION_EMOJI: Record<SessionType, string> = {
  work: '🍅',
  break: '☕',
  longBreak: '🌙',
};

// A dot for the menu-bar title (a label there is noise); the label goes in the
// expanded menu instead.
const POSTURE_META: Record<PostureStatus, { dot: string; label: string }> = {
  good: { dot: '🟢', label: 'Good posture' },
  mild: { dot: '🟡', label: 'Ease up' },
  poor: { dot: '🔴', label: 'Sit back' },
  absent: { dot: '⚪', label: 'No face detected' },
};

function formatFocusMinutes(minutes: number): string {
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours > 0) {
    return `${hours}h ${mins}m`;
  }
  return `${mins}m`;
}

function formatDueIn(dueDate: Date): string {
  const minutes = Math.round((dueDate.getTime() - Date.now()) / 60000);
  if (minutes <= 0) {
    return 'now';
  }
  if (minutes < 60) {
    return `in ${minutes} min`;
  }
  return `in ${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

export function TrayStatusBridge(): null {
  const status = usePomodoroStore((state) => state.status);
  const sessionType = usePomodoroStore((state) => state.sessionType);
  const timeRemaining = usePomodoroStore((state) => state.timeRemaining);
  const nextReminder = useReminderStore((state) =>
    state.upcomingReminders.find((reminder) => reminder.paused !== true)
  );
  const posture = usePosture();
  const postureStatus = posture.tracking ? posture.steadyStatus : null;
  // Look up once and stay defensive: an unknown status must not throw in this
  // always-mounted component (the controller already rejects them, this is a backstop).
  const postureMeta = postureStatus ? POSTURE_META[postureStatus] : null;
  // Posture failure toasts render in the webview, which is often hidden to the tray —
  // mirror the degraded state here, the only always-visible surface.
  let postureDot: string | null = null;
  let postureLine: string | null = null;
  if (posture.error !== null) {
    postureDot = '⚠️';
    postureLine = `⚠️ ${posture.error}`;
  } else if (postureMeta !== null) {
    postureDot = postureMeta.dot;
    postureLine = `${postureMeta.dot} ${postureMeta.label}`;
  }
  const postureControlsEnabled = posture.tracking && posture.nudgesEnabled;
  const pausedUntil = posture.nudgesPausedUntil;
  let pausedLine: string | null = null;
  if (postureControlsEnabled && pausedUntil !== null) {
    pausedLine = `💤 Posture nudges paused · ${describePauseEnd(pausedUntil)}`;
  }

  // Relay Pomodoro/posture control clicks from the native tray menu.
  useEffect(() => {
    const unlisten = listen<string>('tray://action', (event) => {
      const store = usePomodoroStore.getState();
      switch (event.payload) {
        case 'pause':
          store.pause();
          break;
        case 'resume':
          store.resume();
          break;
        case 'start':
          store.start();
          break;
        case 'posture-snooze':
          pausePostureNudges(10);
          break;
        case 'posture-pause-1h':
          pausePostureNudges(60);
          break;
        case 'posture-pause':
          pausePostureNudges('until-resume');
          break;
        case 'posture-resume-nudges':
          resumePostureNudges();
          break;
        default:
          break;
      }
    });
    return () => {
      unlisten
        .then((remove) => remove())
        .catch((error) => logger.error('Failed to remove tray action listener', error));
    };
  }, []);

  // Push the live timer + posture dot into the menu-bar title. Posture stays
  // glanceable there even when no Pomodoro is running.
  useEffect(() => {
    const parts: string[] = [];
    if (postureDot) {
      parts.push(postureDot);
    }
    if (status !== 'idle') {
      const icon = status === 'paused' ? '⏸' : SESSION_EMOJI[sessionType];
      parts.push(`${icon} ${formatTimeRemaining(timeRemaining)}`);
    }
    const title = parts.length > 0 ? parts.join('  ') : null;
    invoke('set_tray_title', { title }).catch((error) =>
      logger.error('Failed to set tray title', error)
    );
  }, [status, sessionType, timeRemaining, postureDot]);

  // Rebuild the menu only on discrete changes (session / pause state / next
  // reminder minute / posture status), not every tick — the countdown lives in
  // the title.
  const reminderKey = nextReminder
    ? `${nextReminder.id}:${Math.round((new Date(nextReminder.dueDate).getTime() - Date.now()) / 60000)}`
    : 'none';
  useEffect(() => {
    let cancelled = false;
    const build = async () => {
      const sessions = await getPomodoroSessions();
      if (cancelled) {
        return;
      }
      const stats = `Today · 🍅 ${countFocusSessionsToday(sessions)} · ${formatFocusMinutes(
        calculateFocusTimeToday(sessions)
      )}`;

      let info: string[];
      let actions: TrayAction[];
      if (status === 'idle' && sessionType === 'work') {
        // Ready to start a focus session (fresh, or after a completed break).
        const line = nextReminder
          ? `🔔 ${nextReminder.text} · ${formatDueIn(new Date(nextReminder.dueDate))}`
          : 'No timer running';
        info = [line, stats];
        actions = [{ id: 'start', label: 'Start focus' }];
      } else if (status === 'idle') {
        // A break is queued (after a completed or skipped work session) but not
        // yet started — surface it so it doesn't read like the timer just stopped.
        const label = getSessionLabel(sessionType);
        info = [`${SESSION_EMOJI[sessionType]} ${label} ready`, stats];
        actions = [{ id: 'start', label: `Start ${label.toLowerCase()}` }];
      } else {
        const paused = status === 'paused';
        const label = `${SESSION_EMOJI[sessionType]} ${getSessionLabel(sessionType)}${
          paused ? ' (paused)' : ''
        }`;
        info = [label, stats];
        actions = paused ? [{ id: 'resume', label: 'Resume' }] : [{ id: 'pause', label: 'Pause' }];
      }

      if (postureLine) {
        info = [postureLine, ...info];
      }
      if (pausedLine) {
        info = [...info, pausedLine];
      }
      // Nudge escape hatches must be reachable without opening the app (ENG-40).
      if (postureControlsEnabled) {
        if (pausedUntil !== null) {
          actions = [...actions, { id: 'posture-resume-nudges', label: 'Resume posture nudges' }];
        } else {
          actions = [
            ...actions,
            { id: 'posture-snooze', label: 'Snooze posture nudges · 10 min' },
            { id: 'posture-pause-1h', label: 'Pause posture nudges · 1 hour' },
            { id: 'posture-pause', label: 'Pause posture nudges · until I resume' },
          ];
        }
      }
      await invoke('set_tray_menu', { info, actions });
    };
    build().catch((error) => logger.error('Failed to build tray menu', error));
    return () => {
      cancelled = true;
    };
  }, [
    status,
    sessionType,
    reminderKey,
    nextReminder,
    postureLine,
    pausedLine,
    pausedUntil,
    postureControlsEnabled,
  ]);

  return null;
}
