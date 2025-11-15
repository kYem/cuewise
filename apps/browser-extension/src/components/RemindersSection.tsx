import { Bell, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useReminderStore } from '../stores/reminder-store';
import { AddReminderForm } from './AddReminderForm';
import { EditReminderForm } from './EditReminderForm';
import { ErrorFallback } from './ErrorFallback';
import { Modal } from './Modal';
import { ReminderItem } from './ReminderItem';

export const RemindersSection: React.FC = () => {
  const {
    upcomingReminders,
    overdueReminders,
    toggleReminder,
    deleteReminder,
    snoozeReminder,
    initialize,
    isLoading,
    error,
  } = useReminderStore();

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingReminderId, setEditingReminderId] = useState<string | null>(null);

  useEffect(() => {
    initialize();
  }, [initialize]);

  const totalReminders = upcomingReminders.length + overdueReminders.length;

  // Find the reminder being edited
  const editingReminder = editingReminderId
    ? [...upcomingReminders, ...overdueReminders].find((r) => r.id === editingReminderId)
    : null;

  const handleEdit = (id: string) => {
    setEditingReminderId(id);
  };

  const handleEditSuccess = () => {
    setEditingReminderId(null);
  };

  const handleEditCancel = () => {
    setEditingReminderId(null);
  };

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-white/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-gray-200 min-h-[400px] flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <div className="p-2 bg-primary-100 rounded-lg">
              <Bell className="w-6 h-6 text-primary-600" />
            </div>
            <div>
              <h2 className="text-2xl font-semibold text-gray-800">Reminders</h2>
              <p className="text-sm text-gray-500">Stay on top of what matters</p>
            </div>
          </div>

          {/* Add Reminder Button */}
          <button
            onClick={() => setIsAddModalOpen(true)}
            className="p-2.5 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors focus:outline-none focus:ring-2 focus:ring-primary-500 focus:ring-offset-2"
            aria-label="Add reminder"
          >
            <Plus className="w-5 h-5" />
          </button>
        </div>

        {/* Content Area */}
        <div className="flex-1 flex flex-col">
          {/* Loading State */}
          {isLoading && <div className="text-center py-8 text-gray-500">Loading reminders...</div>}

          {/* Error State */}
          {!isLoading && error && (
            <ErrorFallback error={error} title="Failed to load reminders" onRetry={initialize} />
          )}

          {/* Empty State */}
          {!isLoading && !error && totalReminders === 0 && (
            <div className="text-center py-8">
              <Bell className="w-16 h-16 mx-auto mb-4 text-gray-300" />
              <p className="text-lg text-gray-500 mb-2">No reminders yet</p>
              <p className="text-sm text-gray-400">Add a reminder to get notified on time</p>
            </div>
          )}

          {/* Reminders Lists */}
          {!isLoading && !error && totalReminders > 0 && (
            <div className="space-y-6">
              {/* Overdue Reminders */}
              {overdueReminders.length > 0 && (
                <div className="space-y-3">
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
                        onEdit={handleEdit}
                        onSnooze={snoozeReminder}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Upcoming Reminders */}
              {upcomingReminders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-sm font-semibold text-gray-600 uppercase tracking-wide">
                    Upcoming ({upcomingReminders.length})
                  </h3>
                  <div className="space-y-2">
                    {upcomingReminders.map((reminder) => (
                      <ReminderItem
                        key={reminder.id}
                        reminder={reminder}
                        onToggle={toggleReminder}
                        onDelete={deleteReminder}
                        onEdit={handleEdit}
                        onSnooze={snoozeReminder}
                      />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Add Reminder Modal */}
      <Modal isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} title="Add Reminder">
        <AddReminderForm onSuccess={() => setIsAddModalOpen(false)} />
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
    </div>
  );
};
