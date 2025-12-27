import { formatDate } from '@cuewise/shared';
import {
  AlertCircle,
  Archive,
  Calendar,
  Check,
  CheckCircle2,
  ChevronLeft,
  Flag,
  Link2Off,
  Pencil,
  Plus,
  Trash2,
} from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useGoalStore } from '../../stores/goal-store';
import { ConfirmationDialog } from '../ConfirmationDialog';
import { GoalInput } from '../GoalInput';
import { Modal } from '../Modal';
import { ObjectiveForm } from './ObjectiveForm';

interface ObjectiveDetailViewProps {
  objectiveId: string;
  onClose: () => void;
}

export const ObjectiveDetailView: React.FC<ObjectiveDetailViewProps> = ({
  objectiveId,
  onClose,
}) => {
  const goals = useGoalStore((state) => state.goals);
  const getObjectiveProgress = useGoalStore((state) => state.getObjectiveProgress);
  const toggleGoal = useGoalStore((state) => state.toggleGoal);
  const deleteObjective = useGoalStore((state) => state.deleteObjective);
  const linkTaskToObjective = useGoalStore((state) => state.linkTaskToObjective);
  const updateObjective = useGoalStore((state) => state.updateObjective);

  const [isEditing, setIsEditing] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showCompleteConfirm, setShowCompleteConfirm] = useState(false);
  const [showTaskInput, setShowTaskInput] = useState(false);

  const objective = goals.find((g) => g.id === objectiveId);
  const progress = getObjectiveProgress(objectiveId);

  if (!objective || !progress) {
    return (
      <div className="p-6 text-center">
        <p className="text-secondary">Objective not found</p>
        <button
          type="button"
          onClick={onClose}
          className="mt-4 text-primary-600 hover:text-primary-700"
        >
          Go back
        </button>
      </div>
    );
  }

  const { total, completed, percent, tasks, daysRemaining, isOverdue } = progress;

  const handleToggleTask = async (taskId: string) => {
    await toggleGoal(taskId);
  };

  const handleUnlinkTask = async (taskId: string) => {
    await linkTaskToObjective(taskId, null);
  };

  const handleDeleteObjective = async () => {
    await deleteObjective(objectiveId);
    onClose();
  };

  const handleCompleteObjective = async () => {
    await updateObjective(objectiveId, { completed: true });
    setShowCompleteConfirm(false);
  };

  const handleReopenObjective = async () => {
    await updateObjective(objectiveId, { completed: false });
  };

  // Determine if we should show the completion prompt
  const allTasksComplete = total > 0 && completed === total && !objective.completed;

  const getDaysLabel = () => {
    if (daysRemaining === null) {
      return null;
    }
    if (daysRemaining === 0) {
      return 'Due today';
    }
    if (daysRemaining === 1) {
      return '1 day left';
    }
    if (daysRemaining > 0) {
      return `${daysRemaining} days left`;
    }
    return `${Math.abs(daysRemaining)} days overdue`;
  };

  if (isEditing) {
    return (
      <Modal isOpen={true} onClose={() => setIsEditing(false)} title="Edit Objective">
        <ObjectiveForm
          objective={objective}
          onCancel={() => setIsEditing(false)}
          onSuccess={() => setIsEditing(false)}
        />
      </Modal>
    );
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-3 p-4 border-b border-border">
        <button
          type="button"
          onClick={onClose}
          className="p-2 hover:bg-surface-variant rounded-lg transition-colors"
          title="Go back"
        >
          <ChevronLeft className="w-5 h-5 text-secondary" />
        </button>
        <div className="flex-1">
          <h2 className="text-lg font-semibold text-primary">Goal Details</h2>
        </div>
        <button
          type="button"
          onClick={() => setIsEditing(true)}
          className="p-2 hover:bg-surface-variant rounded-lg transition-colors"
          title="Edit goal"
        >
          <Pencil className="w-4 h-4 text-secondary" />
        </button>
        <button
          type="button"
          onClick={() => setShowDeleteConfirm(true)}
          className="p-2 hover:bg-red-50 rounded-lg transition-colors"
          title="Delete goal"
        >
          <Trash2 className="w-4 h-4 text-red-500" />
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto p-4 space-y-6">
        {/* Objective Info */}
        <div className="flex items-start gap-4">
          <div
            className={`w-12 h-12 rounded-full flex items-center justify-center flex-shrink-0 ${
              objective.completed
                ? 'bg-green-100 text-green-600'
                : isOverdue
                  ? 'bg-red-100 text-red-600'
                  : 'bg-primary-100 text-primary-600'
            }`}
          >
            {objective.completed ? (
              <CheckCircle2 className="w-6 h-6" />
            ) : (
              <Flag className="w-6 h-6" />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <h3
              className={`text-xl font-semibold ${objective.completed ? 'text-secondary line-through' : 'text-primary'}`}
            >
              {objective.text}
            </h3>

            {objective.description && (
              <p className="text-secondary mt-2">{objective.description}</p>
            )}

            {/* Due date */}
            <div className="flex items-center gap-2 mt-3">
              <Calendar className="w-4 h-4 text-tertiary" />
              <span
                className={`text-sm ${isOverdue ? 'text-red-600 font-medium' : 'text-secondary'}`}
              >
                {formatDate(objective.date)}
                {getDaysLabel() && ` (${getDaysLabel()})`}
              </span>
            </div>
          </div>
        </div>

        {/* Completion Prompt - Show when all tasks are done */}
        {allTasksComplete && (
          <div className="bg-green-50 border border-green-200 rounded-xl p-4">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="w-6 h-6 text-green-600 flex-shrink-0 mt-0.5" />
              <div className="flex-1">
                <h4 className="font-medium text-green-800">All tasks completed!</h4>
                <p className="text-sm text-green-700 mt-1">
                  Congratulations! Would you like to mark this goal as complete?
                </p>
                <button
                  type="button"
                  onClick={() => setShowCompleteConfirm(true)}
                  className="mt-3 flex items-center gap-2 px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 transition-colors text-sm font-medium"
                >
                  <Check className="w-4 h-4" />
                  Complete Goal
                </button>
              </div>
            </div>
          </div>
        )}

        {/* Completed Objective Banner */}
        {objective.completed && (
          <div className="bg-surface-variant border border-border rounded-xl p-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Archive className="w-5 h-5 text-secondary" />
                <div>
                  <p className="text-sm font-medium text-secondary">This goal is complete</p>
                  <p className="text-xs text-tertiary">Completed goals are archived</p>
                </div>
              </div>
              <button
                type="button"
                onClick={handleReopenObjective}
                className="text-sm text-primary-600 hover:text-primary-700 font-medium"
              >
                Reopen
              </button>
            </div>
          </div>
        )}

        {/* Progress */}
        <div className="bg-surface-variant rounded-xl p-4">
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-primary">Progress</span>
            <span
              className={`text-lg font-bold ${percent === 100 ? 'text-green-600' : 'text-primary-600'}`}
            >
              {percent}%
            </span>
          </div>
          <div className="h-3 bg-muted rounded-full overflow-hidden">
            <div
              className={`h-full transition-all ${
                objective.completed ? 'bg-green-500' : isOverdue ? 'bg-red-500' : 'bg-primary-500'
              }`}
              style={{ width: `${percent}%` }}
            />
          </div>
          <p className="text-sm text-secondary mt-2">
            {completed} of {total} tasks completed
          </p>
        </div>

        {/* Linked Tasks */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h4 className="text-sm font-medium text-primary">Linked Tasks</h4>
            {!showTaskInput && (
              <button
                type="button"
                onClick={() => setShowTaskInput(true)}
                className="flex items-center gap-1 text-sm text-primary-600 hover:text-primary-700"
              >
                <Plus className="w-4 h-4" />
                Add Task
              </button>
            )}
          </div>

          {/* Inline Task Input */}
          {showTaskInput && (
            <div className="mb-4">
              <GoalInput
                defaultObjectiveId={objectiveId}
                onTaskAdded={() => setShowTaskInput(false)}
                autoFocus
              />
              <button
                type="button"
                onClick={() => setShowTaskInput(false)}
                className="mt-2 text-xs text-secondary hover:text-primary"
              >
                Cancel
              </button>
            </div>
          )}

          {tasks.length === 0 && !showTaskInput ? (
            <div className="bg-surface-variant rounded-lg p-4 text-center">
              <AlertCircle className="w-8 h-8 text-tertiary mx-auto mb-2" />
              <p className="text-sm text-secondary">No tasks linked to this goal yet.</p>
              <button
                type="button"
                onClick={() => setShowTaskInput(true)}
                className="mt-3 text-sm text-primary-600 hover:text-primary-700"
              >
                Add your first task
              </button>
            </div>
          ) : tasks.length > 0 ? (
            <div className="space-y-2">
              {tasks.map((task) => (
                <div
                  key={task.id}
                  className="flex items-center gap-3 p-3 bg-surface rounded-lg border border-border"
                >
                  <button
                    type="button"
                    onClick={() => handleToggleTask(task.id)}
                    className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      task.completed
                        ? 'bg-green-500 border-green-500 text-white'
                        : 'border-border hover:border-primary-500'
                    }`}
                  >
                    {task.completed && <Check className="w-3 h-3" />}
                  </button>

                  <span
                    className={`flex-1 text-sm ${task.completed ? 'text-secondary line-through' : 'text-primary'}`}
                  >
                    {task.text}
                  </span>

                  <span className="text-xs text-tertiary">{formatDate(task.date)}</span>

                  <button
                    type="button"
                    onClick={() => handleUnlinkTask(task.id)}
                    className="p-1 hover:bg-surface-variant rounded transition-colors"
                    title="Unlink from goal"
                  >
                    <Link2Off className="w-4 h-4 text-tertiary hover:text-secondary" />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {/* Delete Confirmation */}
      <ConfirmationDialog
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        onConfirm={handleDeleteObjective}
        title="Delete Goal"
        message={`Are you sure you want to delete "${objective.text}"? Linked tasks will become standalone tasks.`}
        confirmText="Delete"
        variant="danger"
      />

      {/* Complete Confirmation */}
      <ConfirmationDialog
        isOpen={showCompleteConfirm}
        onClose={() => setShowCompleteConfirm(false)}
        onConfirm={handleCompleteObjective}
        title="Complete Goal"
        message={`Mark "${objective.text}" as complete? Completed goals are archived and hidden from the active view.`}
        confirmText="Complete"
        variant="primary"
      />
    </div>
  );
};
