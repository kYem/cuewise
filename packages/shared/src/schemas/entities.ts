import { z } from 'zod/mini';
import type {
  CalendarEvent,
  CalendarState,
  ConceptCard,
  DailyBackground,
  Goal,
  PlaylistProgress,
  PomodoroSession,
  PostureDailyStat,
  QuickLink,
  Reminder,
  YoutubePlaylist,
} from '../types';
import { assertNoDrift } from './drift';

const subtaskSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
});

export const goalSchema = z.object({
  id: z.string(),
  text: z.string(),
  completed: z.boolean(),
  createdAt: z.string(),
  date: z.string(),
  type: z.optional(z.enum(['task', 'objective'])),
  parentId: z.optional(z.string()),
  transferCount: z.optional(z.number()),
  dueDate: z.optional(z.string()),
  sortOrder: z.optional(z.number()),
  subtasks: z.optional(z.array(subtaskSchema)),
  description: z.optional(z.string()),
});
assertNoDrift<z.infer<typeof goalSchema>, Goal>();

/** The union ties `intervalMinutes` to the interval arm: calendar cadences never carry it. */
const reminderRecurrenceSchema = z.union([
  z.object({ frequency: z.enum(['daily', 'weekly', 'monthly']) }),
  z.object({ frequency: z.literal('interval'), intervalMinutes: z.number() }),
]);

export const reminderSchema = z.object({
  id: z.string(),
  text: z.string(),
  dueDate: z.string(),
  completed: z.boolean(),
  notified: z.boolean(),
  recurring: z.optional(reminderRecurrenceSchema),
  paused: z.optional(z.boolean()),
  category: z.optional(z.enum(['health', 'productivity', 'personal'])),
  completedAt: z.optional(z.string()),
});
assertNoDrift<z.infer<typeof reminderSchema>, Reminder>();

export const pomodoroSessionSchema = z.object({
  id: z.string(),
  startedAt: z.string(),
  completedAt: z.optional(z.string()),
  interrupted: z.boolean(),
  duration: z.number(),
  type: z.enum(['work', 'break', 'longBreak']),
  goalId: z.optional(z.string()),
});
assertNoDrift<z.infer<typeof pomodoroSessionSchema>, PomodoroSession>();

export const quickLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});
assertNoDrift<z.infer<typeof quickLinkSchema>, QuickLink>();

const conceptScheduleSchema = z.object({
  dueDate: z.string(),
  interval: z.number(),
  easeFactor: z.number(),
  repetitions: z.number(),
  lapses: z.number(),
  lastReviewedAt: z.optional(z.string()),
});

export const conceptCardSchema = z.object({
  id: z.string(),
  term: z.string(),
  definition: z.string(),
  details: z.optional(z.string()),
  tags: z.optional(z.array(z.string())),
  source: z.optional(z.string()),
  isFavorite: z.optional(z.boolean()),
  createdAt: z.string(),
  schedule: conceptScheduleSchema,
});
assertNoDrift<z.infer<typeof conceptCardSchema>, ConceptCard>();

export const postureDailyStatSchema = z.object({
  date: z.string(),
  counts: z.object({
    good: z.number(),
    mild: z.number(),
    poor: z.number(),
    absent: z.number(),
  }),
});
assertNoDrift<z.infer<typeof postureDailyStatSchema>, PostureDailyStat>();

/** Discriminated on `allDay`, so a timed event can never be read as an all-day one. */
export const calendarEventSchema = z.union([
  z.object({
    id: z.string(),
    title: z.string(),
    color: z.optional(z.string()),
    htmlLink: z.optional(z.string()),
    allDay: z.literal(false),
    start: z.string(),
    end: z.string(),
  }),
  z.object({
    id: z.string(),
    title: z.string(),
    color: z.optional(z.string()),
    htmlLink: z.optional(z.string()),
    allDay: z.literal(true),
    startDate: z.string(),
    endDate: z.string(),
  }),
]);
assertNoDrift<z.infer<typeof calendarEventSchema>, CalendarEvent>();

export const calendarStateSchema = z.object({
  connected: z.boolean(),
  events: z.array(calendarEventSchema),
  lastSync: z.nullable(z.string()),
});
assertNoDrift<z.infer<typeof calendarStateSchema>, CalendarState>();

/**
 * The same state with its events left unchecked, so a reader can validate the wrapper and
 * then filter the events per item. One stale cached row must not cost `connected` — the
 * store cannot recover that without sending the user back through Google's consent screen.
 */
export const calendarStateEnvelopeSchema = z.object({
  connected: z.boolean(),
  events: z.array(z.unknown()),
  lastSync: z.nullable(z.string()),
});
export type CalendarStateEnvelope = z.infer<typeof calendarStateEnvelopeSchema>;

export const youtubePlaylistSchema = z.object({
  id: z.string(),
  name: z.string(),
  playlistId: z.string(),
  thumbnailUrl: z.optional(z.string()),
  firstVideoId: z.optional(z.string()),
  isCustom: z.boolean(),
});
assertNoDrift<z.infer<typeof youtubePlaylistSchema>, YoutubePlaylist>();

export const playlistProgressSchema = z.object({
  playlistId: z.string(),
  currentVideoId: z.optional(z.string()),
  videoProgress: z.array(
    z.object({ videoId: z.string(), timestamp: z.number(), updatedAt: z.string() })
  ),
});
assertNoDrift<z.infer<typeof playlistProgressSchema>, PlaylistProgress>();

export const dailyBackgroundSchema = z.object({
  url: z.string(),
  category: z.enum(['nature', 'forest', 'ocean', 'mountains', 'minimal', 'dark']),
  date: z.string(),
});
assertNoDrift<z.infer<typeof dailyBackgroundSchema>, DailyBackground>();
