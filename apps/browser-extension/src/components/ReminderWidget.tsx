import { cn } from '@cuewise/ui';
import { AlertCircle, Bell, ChevronDown, ExternalLink, Plus } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useReminderStore } from '../stores/reminder-store';
import { useSettingsStore } from '../stores/settings-store';
import { AddReminderForm } from './AddReminderForm';
import { EditReminderForm } from './EditReminderForm';
import { ErrorFallback } from './ErrorFallback';
import { Modal } from './Modal';
import { ReminderItem } from './ReminderItem';
import { ReminderWidgetItem } from './ReminderWidgetItem';

/**
 * Compact floating reminder widget positioned in the bottom-right corner.
 * Shows the priority reminder (overdue first, then soonest upcoming).
 */
export const ReminderWidget: React.FC = () => {
  const {
    upcomingReminders,
    overdueReminders,
    reminders,
    toggleReminder,
    deleteReminder,
    snoozeReminder,
    initialize,
    isLoading,
    error,
  } = useReminderStore();

  const showThemeSwitcher = useSettingsStore((state) => state.settings.showThemeSwitcher);

  const [isExpanded, setIsExpanded] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);
  const [showAllModal, setShowAllModal] = useState(false);

  const widgetRef = useRef<HTMLDivElement>(null);

  // Initialize reminder store on mount
  useEffect(() => {
    initialize();
  }, [initialize]);

  // Handle click outside to collapse
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (widgetRef.current && !widgetRef.current.contains(event.target as Node)) {
        setIsExpanded(false);
      }
    };

    if (isExpanded) {
      document.addEventListener('mousedown', handleClickOutside);
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isExpanded]);

  // Calculate priority reminders (up to 3) and total count
  const allActiveReminders = [...overdueReminders, ...upcomingReminders];
  const priorityReminders = allActiveReminders.slice(0, 3);
  const totalCount = allActiveReminders.length;
  const hasOverdue = overdueReminders.length > 0;

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

  // Don't render while loading
  if (isLoading) {
    return null;
  }

  // Calculate right position based on theme switcher visibility
  const rightPosition = showThemeSwitcher ? 'right-[340px]' : 'right-4';

  return (
    <>
      <div
        ref={widgetRef}
        className={cn('fixed bottom-4 z-40 transition-all duration-200', rightPosition)}
      >
        {/* Collapsed State */}
        {!isExpanded && (
          <button
            type="button"
            onClick={() => setIsExpanded(true)}
            className={cn(
              'relative p-3 rounded-full shadow-lg hover:shadow-xl hover:scale-105 transition-all',
              'bg-surface/90 backdrop-blur-sm border',
              error ? 'border-orange-500/50' : hasOverdue ? 'border-red-500/50' : 'border-border'
            )}
            aria-label={
              error
                ? 'Error loading reminders. Click to see details.'
                : `${totalCount} reminders. Click to expand.`
            }
          >
            {error ? (
              <AlertCircle className="w-6 h-6 text-orange-500" />
            ) : (
              <Bell className={cn('w-6 h-6', hasOverdue ? 'text-red-500' : 'text-primary-600')} />
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
                  hasOverdue ? 'bg-red-500 text-white' : 'bg-primary-600 text-white'
                )}
              >
                {totalCount > 9 ? '9+' : totalCount}
              </span>
            )}
          </button>
        )}

        {/* Expanded State */}
        {isExpanded && (
          <div className="w-80 bg-surface/95 backdrop-blur-md rounded-2xl shadow-2xl border border-border overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200">
            {/* Header */}
            <div className="flex items-center justify-between p-3 border-b border-border">
              <div className="flex items-center gap-2">
                {error ? (
                  <AlertCircle className="w-5 h-5 text-orange-500" />
                ) : (
                  <Bell
                    className={cn('w-5 h-5', hasOverdue ? 'text-red-500' : 'text-primary-600')}
                  />
                )}
                <span className="font-semibold text-primary">Reminders</span>
                {!error && totalCount > 0 && (
                  <span className="text-sm text-secondary">({totalCount})</span>
                )}
              </div>
              <div className="flex items-center gap-1">
                {/* View All Icon Link - show when more than 3 reminders */}
                {allActiveReminders.length > 3 && (
                  <button
                    type="button"
                    onClick={() => setShowAllModal(true)}
                    className="p-1.5 hover:bg-surface-variant rounded-lg transition-colors text-secondary hover:text-primary"
                    aria-label="View all reminders"
                    title="View all reminders"
                  >
                    <ExternalLink className="w-4 h-4" />
                  </button>
                )}
                {/* Collapse Button */}
                <button
                  type="button"
                  onClick={() => setIsExpanded(false)}
                  className="p-1.5 hover:bg-surface-variant rounded-lg transition-colors"
                  aria-label="Collapse widget"
                >
                  <ChevronDown className="w-5 h-5 text-secondary" />
                </button>
              </div>
            </div>

            {/* Content */}
            <div className="p-3">
              {/* Error State */}
              {error ? (
                <ErrorFallback
                  error={error}
                  title="Failed to load reminders"
                  onRetry={initialize}
                />
              ) : priorityReminders.length > 0 ? (
                /* Priority Reminders (up to 3) */
                <div className="space-y-2">
                  {priorityReminders.map((reminder) => (
                    <ReminderWidgetItem
                      key={reminder.id}
                      reminder={reminder}
                      onToggle={toggleReminder}
                      onDelete={deleteReminder}
                      onEdit={(id) => setEditingReminderId(id)}
                      onSnooze={snoozeReminder}
                    />
                  ))}
                </div>
              ) : (
                <div className="text-center py-6">
                  <Bell className="w-10 h-10 mx-auto mb-2 text-tertiary" />
                  <p className="text-sm text-secondary">No active reminders</p>
                  <p className="text-xs text-tertiary mt-1">Add one to stay on track</p>
                </div>
              )}
            </div>

            {/* Footer Actions */}
            <div className="flex items-center justify-end p-3 border-t border-border bg-surface-variant/30">
              <button
                type="button"
                onClick={() => setIsAddModalOpen(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
              >
                <Plus className="w-4 h-4" />
                Add
              </button>
            </div>
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
                  />
                ))}
              </div>
            </div>
          )}

          {/* Empty State */}
          {allActiveReminders.length === 0 && (
            <div className="text-center py-8">
              <Bell className="w-12 h-12 mx-auto mb-3 text-tertiary" />
              <p className="text-secondary">No active reminders</p>
            </div>
          )}
        </div>
      </Modal>
    </>
  );
};
