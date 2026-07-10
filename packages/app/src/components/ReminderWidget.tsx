import { getScheduler } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { AlertCircle, Bell } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReminderStore } from '../stores/reminder-store';
import { useSettingsStore } from '../stores/settings-store';
import { AddReminderForm } from './AddReminderForm';
import { EditReminderForm } from './EditReminderForm';
import { ErrorFallback } from './ErrorFallback';
import { Modal } from './Modal';
import { ReminderItem } from './ReminderItem';
import {
  AgendaReminderPanel,
  ComposedReminderPanel,
  EmptyReminders,
  type ReminderPanelProps,
} from './reminders';

/**
 * Floating reminder widget in the bottom-right corner. The bell expands the
 * panel layout chosen by the `reminderPanelLayout` setting (composed | agenda).
 */
export const ReminderWidget: React.FC = () => {
  const {
    upcomingReminders,
    overdueReminders,
    reminders,
    toggleReminder,
    deleteReminder,
    snoozeReminder,
    setReminderPaused,
    fireDueReminders,
    initialize,
    isLoading,
    error,
  } = useReminderStore();

  const showThemeSwitcher = useSettingsStore((state) => state.settings.showThemeSwitcher);
  const reminderPanelLayout = useSettingsStore((state) => state.settings.reminderPanelLayout);
  const reminderPanelPinned = useSettingsStore((state) => state.settings.reminderPanelPinned);
  const updateSettings = useSettingsStore((state) => state.updateSettings);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [showAllModal, setShowAllModal] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);
  const didAutoExpandRef = useRef(false);

  // Initialize on mount, then catch up any reminder whose alarm never fired —
  // a missed-alarm safety net (browser closed at the due time, or a dropped
  // alarm) that also serves as the first firing pass in dev.
  useEffect(() => {
    initialize().then(() => fireDueReminders());
  }, [initialize, fireDueReminders]);

  // A background scheduler (extension worker, native host) fires due reminders on
  // its own. Only when nothing delivers wakes in the background (dev server, web)
  // do we poll in-page as a fallback — feature-detected by asking the port
  // (`deliversInBackground`), never by sniffing globals like `chrome.alarms`
  // (MDN calls sniffing "a terrible practice … discouraged at all costs").
  useEffect(() => {
    if (getScheduler().deliversInBackground) {
      return;
    }
    const interval = setInterval(() => {
      fireDueReminders();
    }, 5000);
    return () => clearInterval(interval);
  }, [fireDueReminders]);

  // Auto-expand a pinned panel once per load; the guard trips only after the
  // stored `true` hydrates, and a later manual collapse sticks (effect won't re-fire).
  useEffect(() => {
    if (didAutoExpandRef.current) {
      return;
    }
    if (reminderPanelPinned) {
      didAutoExpandRef.current = true;
      setIsExpanded(true);
    }
  }, [reminderPanelPinned]);

  // Collapse on outside click — but not while a reminder modal (add / edit /
  // manage) is open, so opening the add form keeps the alerts card in place.
  useEffect(() => {
    const anyModalOpen = isAddModalOpen || editingReminderId !== null || showAllModal;
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded && !anyModalOpen && !reminderPanelPinned) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded, isAddModalOpen, editingReminderId, showAllModal, reminderPanelPinned]);

  // Active reminders drive both the count badge and the chosen panel.
  const allActiveReminders = [...overdueReminders, ...upcomingReminders];
  const totalCount = allActiveReminders.length;
  const hasOverdue = overdueReminders.length > 0;

  // Bind store actions to the shared panel contract (both layouts use this).
  const panelProps: ReminderPanelProps = {
    reminders: allActiveReminders,
    onToggle: toggleReminder,
    onSnooze: snoozeReminder,
    onPauseToggle: setReminderPaused,
    onAdd: () => setIsAddModalOpen(true),
    onManage: () => setShowAllModal(true),
    pinToggle: {
      pinned: reminderPanelPinned,
      onChange: (next) => updateSettings({ reminderPanelPinned: next }),
    },
    viewSwitcher: {
      layout: reminderPanelLayout,
      onChange: (next) => updateSettings({ reminderPanelLayout: next }),
    },
  };

  // Find reminder being edited
  const editingReminder = editingReminderId
    ? [...upcomingReminders, ...overdueReminders, ...reminders].find(
        (r) => r.id === editingReminderId
      )
    : null;

  const handleAddSuccess = useCallback(() => {
    setIsAddModalOpen(false);
  }, []);

  const handleEditSuccess = useCallback(() => {
    setEditingReminderId(null);
  }, []);

  const handleEditCancel = useCallback(() => {
    setEditingReminderId(null);
  }, []);

  // Calculate right position based on theme switcher visibility
  const rightPosition = showThemeSwitcher ? 'right-[340px]' : 'right-4';

  // Show loading skeleton while initializing
  if (isLoading) {
    return (
      <div className={cn('fixed bottom-4 z-40', rightPosition)}>
        <div className="p-3 rounded-full shadow-lg bg-surface/90 backdrop-blur-sm border border-border animate-pulse">
          <Bell className="w-6 h-6 text-tertiary" />
        </div>
      </div>
    );
  }

  return (
    <>
      <div
        ref={widgetRef}
        className={cn('fixed bottom-4 z-40 transition-all duration-200', rightPosition)}
      >
        {/* Always visible button */}
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className={cn(
            'relative p-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all',
            'bg-surface/90 backdrop-blur-sm border',
            error ? 'border-orange-500/50' : hasOverdue ? 'border-red-400/50' : 'border-border'
          )}
          aria-label={
            error
              ? 'Error loading reminders. Click to see details.'
              : `${totalCount} reminders. Click to ${isExpanded ? 'collapse' : 'expand'}.`
          }
        >
          {error ? (
            <AlertCircle className="w-6 h-6 text-orange-500" />
          ) : (
            <Bell className={cn('w-6 h-6', hasOverdue ? 'text-red-400' : 'text-primary-600')} />
          )}

          {/* Error Badge */}
          {error && (
            <span className="absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center text-xs font-bold rounded-full bg-orange-500 text-white">
              !
            </span>
          )}

          {/* Count Badge */}
          {!error && totalCount > 0 && (
            <span
              className={cn(
                'absolute -top-1 -right-1 min-w-[20px] h-5 flex items-center justify-center',
                'text-xs font-bold rounded-full',
                hasOverdue ? 'bg-red-400 text-white' : 'bg-primary-600 text-white'
              )}
            >
              {totalCount > 9 ? '9+' : totalCount}
            </span>
          )}
        </button>

        {/* Expanded Panel - positioned above the button; layout chosen by setting */}
        {isExpanded && (
          <div className="absolute bottom-full right-0 mb-2 animate-fade-in">
            {error ? (
              <div className="w-[380px] rounded-2xl bg-surface-elevated backdrop-blur-xl border border-border shadow-2xl overflow-hidden p-3">
                <ErrorFallback
                  error={error}
                  title="Failed to load reminders"
                  onRetry={initialize}
                />
              </div>
            ) : reminderPanelLayout === 'agenda' ? (
              <AgendaReminderPanel {...panelProps} />
            ) : (
              <ComposedReminderPanel {...panelProps} />
            )}
          </div>
        )}
      </div>

      {/* Add Reminder Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Reminder">
        <AddReminderForm onSuccess={handleAddSuccess} />
      </Modal>

      {/* Edit Reminder Modal */}
      {editingReminder && (
        <Modal isOpen={!!editingReminderId} onClose={handleEditCancel} title="Edit Reminder">
          <EditReminderForm
            reminder={editingReminder}
            onSuccess={handleEditSuccess}
            onCancel={handleEditCancel}
          />
        </Modal>
      )}

      {/* View All Reminders Modal */}
      <Modal isOpen={showAllModal} onClose={() => setShowAllModal(false)} title="All Reminders">
        <div className="space-y-4">
          {/* Overdue Section */}
          {overdueReminders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-red-600 uppercase tracking-wide">
                Overdue ({overdueReminders.length})
              </h3>
              <div className="space-y-2">
                {overdueReminders.map((reminder) => (
                  <ReminderItem
                    key={reminder.id}
                    reminder={reminder}
                    onToggle={toggleReminder}
                    onDelete={deleteReminder}
                    onEdit={(id) => {
                      setShowAllModal(false);
                      setEditingReminderId(id);
                    }}
                    onSnooze={snoozeReminder}
                    onPauseToggle={setReminderPaused}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Upcoming Section */}
          {upcomingReminders.length > 0 && (
            <div className="space-y-2">
              <h3 className="text-sm font-semibold text-secondary uppercase tracking-wide">
                Upcoming ({upcomingReminders.length})
              </h3>
              <div className="space-y-2">
                {upcomingReminders.map((reminder) => (
                  <ReminderItem
                    key={reminder.id}
                    reminder={reminder}
                    onToggle={toggleReminder}
                    onDelete={deleteReminder}
                    onEdit={(id) => {
                      setShowAllModal(false);
                      setEditingReminderId(id);
                    }}
                    onSnooze={snoozeReminder}
                    onPauseToggle={setReminderPaused}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {allActiveReminders.length === 0 && <EmptyReminders />}
        </div>
      </Modal>
    </>
  );
};
