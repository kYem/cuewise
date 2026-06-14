import { reminderFactory } from '@cuewise/test-utils';
import { defaultSettings } from '@cuewise/test-utils/fixtures';
import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useReminderStore } from '../stores/reminder-store';
import { useSettingsStore } from '../stores/settings-store';
import { ReminderWidget } from './ReminderWidget';

vi.mock('../stores/reminder-store', () => ({
  useReminderStore: vi.fn(),
}));

vi.mock('../stores/settings-store', () => ({
  useSettingsStore: vi.fn(),
}));

const HOUR_MS = 60 * 60 * 1000;

// One active upcoming reminder plus the action fns the widget destructures.
function mockReminderStore(overrides: Record<string, unknown> = {}) {
  const upcoming = reminderFactory.build({
    id: 'upcoming-1',
    text: 'Review pull request',
    category: 'productivity',
    dueDate: new Date(Date.now() + 3 * HOUR_MS).toISOString(),
  });
  vi.mocked(useReminderStore).mockReturnValue({
    upcomingReminders: [upcoming],
    overdueReminders: [],
    reminders: [upcoming],
    toggleReminder: vi.fn(),
    deleteReminder: vi.fn(),
    snoozeReminder: vi.fn(),
    setReminderPaused: vi.fn(),
    fireDueReminders: vi.fn(),
    initialize: vi.fn().mockResolvedValue(undefined),
    isLoading: false,
    error: null,
    ...overrides,
  });
}

// The widget reads settings via selectors, so the mock must apply the selector.
// Only `settings` is provided; cast covers the store fields the widget never touches.
function mockSettings(reminderPanelLayout: 'composed' | 'agenda') {
  const state = { settings: { ...defaultSettings, reminderPanelLayout } };
  vi.mocked(useSettingsStore).mockImplementation((selector) =>
    selector(state as Parameters<typeof selector>[0])
  );
}

function expandPanel() {
  fireEvent.click(screen.getByRole('button', { name: /Click to expand/ }));
}

describe('ReminderWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('mounts the composed layout when reminderPanelLayout is "composed"', () => {
    mockReminderStore();
    mockSettings('composed');

    render(<ReminderWidget />);
    expandPanel();

    // "Scheduled" is a composed-only subheader.
    expect(screen.getByText('Scheduled')).toBeInTheDocument();
    expect(screen.queryByText('Later today')).not.toBeInTheDocument();
  });

  it('mounts the agenda layout when reminderPanelLayout is "agenda"', () => {
    mockReminderStore();
    mockSettings('agenda');

    render(<ReminderWidget />);
    expandPanel();

    // "Later today" is an agenda-only group label.
    expect(screen.getByText('Later today')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
  });

  it('renders the error fallback and no panel when the store reports an error', () => {
    mockReminderStore({ error: 'Failed to read storage' });
    mockSettings('composed');

    render(<ReminderWidget />);
    fireEvent.click(screen.getByRole('button', { name: /Click to see details/ }));

    expect(screen.getByText('Failed to load reminders')).toBeInTheDocument();
    expect(screen.queryByText('Scheduled')).not.toBeInTheDocument();
  });
});
