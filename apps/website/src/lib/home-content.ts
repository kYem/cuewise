export type StepKey = 'today' | 'pomodoro' | 'focus' | 'recall' | 'insights' | 'themes';

export type IconName =
  | 'target'
  | 'timer'
  | 'max'
  | 'music'
  | 'brain'
  | 'save'
  | 'bell'
  | 'quote'
  | 'palette'
  | 'clock'
  | 'chart'
  | 'cmd'
  | 'lock'
  | 'cloud'
  | 'shield'
  | 'check'
  | 'x';

export interface DockStep {
  key: StepKey;
  icon: IconName;
  label: string;
  title: string;
  caption: string;
  alt: string;
}

export interface Row {
  icon: IconName;
  name: string;
  line: string;
}

export interface SectionHead {
  id: string;
  kicker: string;
  title: string;
  muted: string;
  text: string;
}

export const HERO = {
  eyebrow: 'Free · No account · Open source',
  title: 'Focus on today.',
  accent: 'Remember what you learn.',
  sub: "Cuewise turns every new tab into a calm place to start: today's goals, a focus timer, reminders, and flashcards that return when it's time to review them.",
  primaryCta: 'Add to Chrome — Free',
  secondaryCta: 'See it in action',
  secondaryCtaLive: 'Try it right here',
} as const;

export const STAGE_NOTES = {
  screenshots: 'Real screenshots of the extension.',
  live: 'This is the extension itself, with sample data that resets on reload. Some features need the installed version.',
} as const;

export const DOCK_STEPS: readonly DockStep[] = [
  {
    key: 'today',
    icon: 'target',
    label: 'Today',
    title: "Today's Focus.",
    caption: 'Type a goal, tick it off, and the ring fills as your day moves.',
    alt: 'Cuewise new tab with three goals for today and a quote',
  },
  {
    key: 'pomodoro',
    icon: 'timer',
    label: 'Pomodoro',
    title: 'Pomodoro.',
    caption: '25 minutes on, 5 off, with rain or cafe noise if you want it.',
    alt: 'Cuewise Pomodoro timer paused at 24:16 beside a quote',
  },
  {
    key: 'focus',
    icon: 'max',
    label: 'Focus mode',
    title: 'Focus mode.',
    caption: 'One goal, one timer, a quiet photo. Nothing else on screen.',
    alt: 'Cuewise Focus mode with one goal and a full-screen timer',
  },
  {
    key: 'recall',
    icon: 'brain',
    label: 'Recall',
    title: 'Concept cards.',
    caption: "Bring it to mind, reveal, grade. It returns when it's due.",
    alt: 'Cuewise new tab showing a concept card to recall',
  },
  {
    key: 'insights',
    icon: 'chart',
    label: 'Insights',
    title: 'Insights.',
    caption: 'Streaks, focus time and the hours you do your best work.',
    alt: 'Cuewise Insights with a 17-day streak and a focus heatmap',
  },
  {
    key: 'themes',
    icon: 'palette',
    label: 'Themes',
    title: 'Four themes.',
    caption: 'Glass over a daily photo or your own image, or Purple, Forest and Rose.',
    alt: 'Cuewise new tab in the Purple theme',
  },
];

export const SECTION_HEADS = {
  features: {
    id: 'features',
    kicker: 'On every new tab',
    title: 'Everything for today.',
    muted: 'Nothing in the way.',
    text: "The demo above is the whole product. This is what's in it.",
  },
  privacy: {
    id: 'privacy',
    kicker: 'Private by default',
    title: 'Local first.',
    muted: 'Synced only if you ask.',
    text: 'No account, no tracking, and code you can read.',
  },
  fit: {
    id: 'fit',
    kicker: 'An honest fit check',
    title: 'Great for some.',
    muted: 'Not for everyone.',
    text: 'A new tab is personal. Here is where Cuewise fits, and where another one will serve you better.',
  },
} as const satisfies Record<string, SectionHead>;

export const INSIDE_GROUPS: readonly { title: string; rows: readonly Row[] }[] = [
  {
    title: 'Focus',
    rows: [
      {
        icon: 'target',
        name: "Today's Focus",
        line: 'A short list of goals, with subtasks and due dates.',
      },
      {
        icon: 'timer',
        name: 'Pomodoro',
        line: '25 on, 5 off, or your own rhythm. Pops out to float over other tabs.',
      },
      { icon: 'max', name: 'Focus mode', line: 'One goal, one timer, full screen.' },
      {
        icon: 'music',
        name: 'Sounds',
        line: 'Six soundscapes, or your own YouTube playlists.',
      },
    ],
  },
  {
    title: 'Remember',
    rows: [
      {
        icon: 'brain',
        name: 'Concept cards',
        line: 'Active recall on a spaced-repetition schedule, with ten starter packs.',
      },
      {
        icon: 'save',
        name: 'Capture',
        line: 'Save a line from any page as a card or a quote.',
      },
      {
        icon: 'bell',
        name: 'Reminders and habits',
        line: 'Nudges you can snooze, and streaks for habits.',
      },
      {
        icon: 'quote',
        name: 'Quotes',
        line: 'Ten categories. Favorite them, group them into collections, or add your own.',
      },
    ],
  },
  {
    title: 'Make it yours',
    rows: [
      {
        icon: 'palette',
        name: 'Themes',
        line: 'Glass over a daily photo or your own, or Purple, Forest and Rose.',
      },
      {
        icon: 'clock',
        name: 'Widgets',
        line: 'Clock, world clock, weather, quick links, notes, calendar.',
      },
      {
        icon: 'chart',
        name: 'Insights',
        line: 'Streaks, trends, and a heatmap of your focus hours.',
      },
      {
        icon: 'cmd',
        name: 'Shortcuts',
        line: 'A command palette, and keys for the things you do most.',
      },
    ],
  },
];

export const PRIVACY_POINTS: readonly { icon: IconName; title: string; text: string }[] = [
  {
    icon: 'lock',
    title: 'Local first',
    text: 'Goals, cards and history stay in your browser.',
  },
  {
    icon: 'cloud',
    title: 'Sync, if you want it',
    text: 'Off by default, and encrypted on your device before anything leaves.',
  },
  {
    icon: 'shield',
    title: 'Open and signed',
    text: 'The code is public, and every release is reviewed and signed.',
  },
];

export const FIT_CHECK: readonly { title: string; icon: IconName; items: readonly string[] }[] = [
  {
    title: 'A good fit if you want',
    icon: 'check',
    items: [
      'Goals, a timer, reminders and recall in one tab',
      'Everything free, with no paid tier',
      'Your data on your device',
    ],
  },
  {
    title: 'Look elsewhere if you need',
    icon: 'x',
    items: [
      'Firefox or Safari. Cuewise runs on Chrome, Edge, Brave and other Chromium browsers.',
      "Another language. It's English only for now.",
      'Custom CSS, clock faces or video backgrounds',
    ],
  },
];
