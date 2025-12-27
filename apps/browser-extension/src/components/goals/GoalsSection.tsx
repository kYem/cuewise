import { Flag, Plus } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useGoalStore } from '../../stores/goal-store';
import { Modal } from '../Modal';
import { GoalCard } from './GoalCard';
import { GoalDetailView } from './GoalDetailView';
import { GoalForm } from './GoalForm';

interface GoalsSectionProps {
  onObjectiveClick?: (objectiveId: string) => void;
  showCompleted?: boolean;
  compact?: boolean;
  showCreateButton?: boolean;
}

export const GoalsSection: React.FC<GoalsSectionProps> = ({
  onObjectiveClick,
  showCompleted = false,
  compact = false,
  showCreateButton = false,
}) => {
  const getObjectives = useGoalStore((state) => state.getObjectives);
  const getObjectiveProgress = useGoalStore((state) => state.getObjectiveProgress);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [selectedGoalId, setSelectedObjectiveId] = useState<string | null>(null);

  const objectives = getObjectives();

  // Filter based on showCompleted preference
  const filteredObjectives = showCompleted
    ? objectives
    : objectives.filter((obj) => !obj.completed);

  // Sort by due date (soonest first)
  const sortedObjectives = [...filteredObjectives].sort((a, b) => {
    // Completed goals go to the end
    if (a.completed !== b.completed) {
      return a.completed ? 1 : -1;
    }
    // Then sort by date
    return a.date.localeCompare(b.date);
  });

  const handleObjectiveClick = (objectiveId: string) => {
    if (onObjectiveClick) {
      onObjectiveClick(objectiveId);
    } else {
      setSelectedObjectiveId(objectiveId);
    }
  };

  const handleCloseDetail = () => {
    setSelectedObjectiveId(null);
  };

  const handleFormSuccess = () => {
    setIsFormOpen(false);
  };

  const selectedGoal = selectedGoalId ? objectives.find((o) => o.id === selectedGoalId) : null;

  if (sortedObjectives.length === 0) {
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
        {sortedObjectives.map((objective) => {
          const progress = getObjectiveProgress(objective.id);
          if (!progress) {
            return null;
          }

          return (
            <GoalCard
              key={objective.id}
              objective={objective}
              progress={progress}
              onClick={() => handleObjectiveClick(objective.id)}
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
          <GoalDetailView objectiveId={selectedGoal.id} onClose={handleCloseDetail} />
        </Modal>
      )}
    </div>
  );
};
