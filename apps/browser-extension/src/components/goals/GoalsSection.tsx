import { Flag, Plus } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useGoalStore } from '../../stores/goal-store';
import { Modal } from '../Modal';
import { GoalCard } from './GoalCard';
import { GoalDetailView } from './GoalDetailView';
import { GoalForm } from './GoalForm';

interface GoalsSectionProps {
  onGoalClick?: (goalId: string) => void;
  showCompleted?: boolean;
  compact?: boolean;
  showCreateButton?: boolean;
}

export const GoalsSection: React.FC<GoalsSectionProps> = ({
  onGoalClick,
  showCompleted = false,
  compact = false,
  showCreateButton = false,
}) => {
  const getGoals = useGoalStore((state) => state.getGoals);
  const getGoalProgress = useGoalStore((state) => state.getGoalProgress);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(null);

  const goalItems = getGoals();

  // Filter based on showCompleted preference
  const filteredGoals = showCompleted ? goalItems : goalItems.filter((obj) => !obj.completed);

  // Sort by due date (soonest first)
  const sortedGoals = [...filteredGoals].sort((a, b) => {
    // Completed goals go to the end
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    // Then sort by date
    return a.date.localeCompare(b.date);
  });

  const handleGoalClick = (goalId: string) => {
    if (onGoalClick) {
      onGoalClick(goalId);
    } else {
      setSelectedGoalId(goalId);
    }
  };

  const handleCloseDetail = () => {
    setSelectedGoalId(null);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
  };

  const selectedGoal = selectedGoalId ? goalItems.find((o) => o.id === selectedGoalId) : null;

  if (sortedGoals.length === 0) {
    return (
      <div className="space-y-4">
        {showCreateButton && (
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => setIsFormOpen(true)}
              className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all font-medium"
            >
              <Plus className="w-4 h-4" />
              <span>New Goal</span>
            </button>
          </div>
        )}

        <div className="text-center py-12">
          <Flag className="w-12 h-12 mx-auto mb-4 text-tertiary" />
          <p className="text-secondary text-sm mb-2">
            {showCompleted ? 'No goals yet' : 'No active goals'}
          </p>
          <p className="text-tertiary text-xs">Create a goal to track what you want to achieve</p>
        </div>

        {/* Create Objective Modal */}
        <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="New Goal">
          <GoalForm onCancel={() => setIsFormOpen(false)} onSuccess={handleFormSuccess} />
        </Modal>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {showCreateButton && (
        <div className="flex justify-end">
          <button
            type="button"
            onClick={() => setIsFormOpen(true)}
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-all font-medium"
          >
            <Plus className="w-4 h-4" />
            <span>New Goal</span>
          </button>
        </div>
      )}

      <div className="space-y-3">
        {sortedGoals.map((goalItem) => {
          const progress = getGoalProgress(goalItem.id);
          if (!progress) {
            return null;
          }

          return (
            <GoalCard
              key={goalItem.id}
              goal={goalItem}
              progress={progress}
              onClick={() => handleGoalClick(goalItem.id)}
              compact={compact}
            />
          );
        })}
      </div>

      {/* Create Goal Modal */}
      <Modal isOpen={isFormOpen} onClose={() => setIsFormOpen(false)} title="New Goal">
        <GoalForm onCancel={() => setIsFormOpen(false)} onSuccess={handleFormSuccess} />
      </Modal>

      {/* Goal Detail Modal */}
      {selectedGoal && (
        <Modal isOpen={!!selectedGoal} onClose={handleCloseDetail}>
          <GoalDetailView goalId={selectedGoal.id} onClose={handleCloseDetail} />
        </Modal>
      )}
    </div>
  );
};
