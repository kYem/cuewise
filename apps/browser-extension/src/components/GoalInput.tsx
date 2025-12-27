import { Check, Flag, Link2, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

interface GoalInputProps {
  defaultObjectiveId?: string;
  onTaskAdded?: () => void;
  autoFocus?: boolean;
}

export const GoalInput: React.FC<GoalInputProps> = ({
  defaultObjectiveId,
  onTaskAdded,
  autoFocus = false,
}) => {
  const [text, setText] = useState('');
  const [selectedObjectiveId, setSelectedObjectiveId] = useState<string | null>(
    defaultObjectiveId ?? null
  );
  const [showObjectivePicker, setShowObjectivePicker] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const pickerRef = useRef<HTMLDivElement>(null);
  const addGoal = useGoalStore((state) => state.addGoal);
  const getActiveObjectives = useGoalStore((state) => state.getActiveObjectives);
  const getObjectiveProgress = useGoalStore((state) => state.getObjectiveProgress);

  const activeObjectives = getActiveObjectives();
  const hasObjectives = activeObjectives.length > 0;
  const selectedObjective = activeObjectives.find((o) => o.id === selectedObjectiveId);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  // Close picker when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (pickerRef.current && !pickerRef.current.contains(event.target as Node)) {
        setShowObjectivePicker(false);
      }
    };

    if (showObjectivePicker) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [showObjectivePicker]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      await addGoal(text, selectedObjectiveId ?? undefined);
      setText('');
      if (!defaultObjectiveId) {
        setSelectedObjectiveId(null);
      }
      if (onTaskAdded) {
        onTaskAdded();
      }
    }
  };

  const handleKeyDown = async (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        await addGoal(text, selectedObjectiveId ?? undefined);
        setText('');
        if (!defaultObjectiveId) {
          setSelectedObjectiveId(null);
        }
        if (onTaskAdded) {
          onTaskAdded();
        }
      }
    }
  };

  const handleObjectiveSelect = (objectiveId: string | null) => {
    setSelectedObjectiveId(objectiveId);
    setShowObjectivePicker(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-1">
      <div className="flex gap-2">
        <input
          ref={inputRef}
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="What do you want to focus on today?"
          className="flex-1 px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-secondary"
          maxLength={200}
        />

        {/* Link to Objective button - only show if there are objectives */}
        {hasObjectives && (
          <div className="relative" ref={pickerRef}>
            <button
              type="button"
              onClick={() => setShowObjectivePicker(!showObjectivePicker)}
              className={`p-3 rounded-lg border-2 transition-all ${
                selectedObjectiveId
                  ? 'bg-primary-50 border-primary-500 text-primary-600'
                  : 'border-border text-secondary hover:border-primary-300 hover:text-primary-500'
              }`}
              title={
                selectedObjectiveId
                  ? `Linked to: ${selectedObjective?.text ?? 'Goal'}`
                  : 'Link to goal'
              }
            >
              <Link2 className="w-5 h-5" />
            </button>

            {/* Dropdown menu */}
            {showObjectivePicker && (
              <div className="absolute right-0 top-full mt-1 z-50 min-w-[220px] py-1 bg-surface border-2 border-border rounded-lg shadow-xl">
                {/* No goal option */}
                <button
                  type="button"
                  onClick={() => handleObjectiveSelect(null)}
                  className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-variant ${
                    !selectedObjectiveId
                      ? 'bg-primary-50 text-primary-700 font-medium'
                      : 'text-primary'
                  }`}
                >
                  <span className="flex-1">No goal</span>
                  {!selectedObjectiveId && <Check className="w-4 h-4 text-primary-600" />}
                </button>

                {/* Divider */}
                <div className="border-t border-border my-1" />

                {/* Objective options */}
                {activeObjectives.map((obj) => {
                  const progress = getObjectiveProgress(obj.id);
                  const percent = progress?.percent ?? 0;
                  const isSelected = selectedObjectiveId === obj.id;

                  return (
                    <button
                      key={obj.id}
                      type="button"
                      onClick={() => handleObjectiveSelect(obj.id)}
                      className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-variant ${
                        isSelected ? 'bg-primary-50 text-primary-700 font-medium' : 'text-primary'
                      }`}
                    >
                      <Flag className="w-4 h-4 text-primary-600 flex-shrink-0" />
                      <span className="flex-1 truncate">{obj.text}</span>
                      <span className="text-xs text-secondary flex-shrink-0">{percent}%</span>
                      {isSelected && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        )}

        <button
          type="submit"
          disabled={!text.trim()}
          className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium shadow-sm hover:shadow-md"
        >
          <Plus className="w-5 h-5" />
          <span>Add</span>
        </button>
      </div>

      {/* Show selected goal as small indicator */}
      {selectedObjectiveId && selectedObjective && (
        <div className="flex items-center gap-1 text-xs text-primary-600">
          <Link2 className="w-3 h-3" />
          <span>Will link to: {selectedObjective.text}</span>
          <button
            type="button"
            onClick={() => setSelectedObjectiveId(null)}
            className="ml-1 text-secondary hover:text-primary underline"
          >
            Remove
          </button>
        </div>
      )}
    </form>
  );
};
