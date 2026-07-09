import { formatDate, type Goal, type GoalProgress } from '@cuewise/shared';
import { Calendar, CheckCircle2, ChevronRight, Flag } from 'lucide-react';
import type React from 'react';

interface GoalCardProps {
  goal: Goal;
  progress: GoalProgress;
  onClick?: () => void;
  compact?: boolean;
}

export const GoalCard: React.FC<GoalCardProps> = ({ goal, progress, onClick, compact = false }) => {
  const { total, completed, percent, daysRemaining, isOverdue } = progress;

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

  const daysLabel = getDaysLabel();

  if (compact) {
    return (
      <button
        type="button"
        onClick={onClick}
        className="w-full flex items-center gap-3 p-3 rounded-lg bg-surface hover:bg-surface-variant transition-colors text-left"
      >
        <div className="flex-shrink-0">
          <div
            className={`w-8 h-8 rounded-full flex items-center justify-center ${
              goal.completed ? 'bg-green-100 text-green-600' : 'bg-primary-100 text-primary-600'
            }`}
          >
            {goal.completed ? <CheckCircle2 className="w-4 h-4" /> : <Flag className="w-4 h-4" />}
          </div>
        </div>

        <div className="flex-1 min-w-0">
          <p
            className={`text-sm font-medium truncate ${goal.completed ? 'text-secondary line-through' : 'text-primary'}`}
          >
            {goal.text}
          </p>
          <div className="flex items-center gap-2 mt-0.5">
            <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  goal.completed ? 'bg-green-500' : 'bg-primary-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
            <span className="text-xs text-secondary whitespace-nowrap">
              {completed}/{total}
            </span>
          </div>
        </div>

        <ChevronRight className="w-4 h-4 text-tertiary flex-shrink-0" />
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full p-4 rounded-xl bg-surface border border-border hover:border-primary-300 hover:shadow-md transition-all text-left group"
    >
      <div className="flex items-start gap-3">
        <div
          className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 ${
            goal.completed
              ? 'bg-green-100 text-green-600'
              : isOverdue
                ? 'bg-red-100 text-red-600'
                : 'bg-primary-100 text-primary-600'
          }`}
        >
          {goal.completed ? <CheckCircle2 className="w-5 h-5" /> : <Flag className="w-5 h-5" />}
        </div>

        <div className="flex-1 min-w-0">
          <h3
            className={`font-medium ${goal.completed ? 'text-secondary line-through' : 'text-primary'}`}
          >
            {goal.text}
          </h3>

          {goal.description && (
            <p className="text-sm text-secondary mt-1 line-clamp-2">{goal.description}</p>
          )}

          {/* Progress bar */}
          <div className="mt-3">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm text-secondary">
                {completed} of {total} tasks
              </span>
              <span
                className={`text-sm font-medium ${
                  percent === 100 ? 'text-green-600' : 'text-primary-600'
                }`}
              >
                {percent}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full transition-all ${
                  goal.completed ? 'bg-green-500' : isOverdue ? 'bg-red-500' : 'bg-primary-500'
                }`}
                style={{ width: `${percent}%` }}
              />
            </div>
          </div>

          {/* Due date */}
          {daysLabel && (
            <div className="flex items-center gap-1.5 mt-3">
              <Calendar className="w-3.5 h-3.5 text-tertiary" />
              <span
                className={`text-xs ${isOverdue ? 'text-red-600 font-medium' : 'text-secondary'}`}
              >
                {daysLabel} ({formatDate(goal.date)})
              </span>
            </div>
          )}
        </div>

        <ChevronRight className="w-5 h-5 text-tertiary group-hover:text-primary-500 transition-colors flex-shrink-0 mt-2" />
      </div>
    </button>
  );
};
