import type { Goal } from '@cuewise/shared';
import { Popover, PopoverContent, PopoverTrigger } from '@cuewise/ui';
import { Check, Flag, Link2, Plus } from 'lucide-react';
import type React from 'react';
import { useEffect, useRef, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

/** 'minimal' for direct background use, 'boxed' for panels/modals, 'widget' for the soft pill add-row */
type GoalInputVariant = 'minimal' | 'boxed' | 'widget';

interface GoalPickerContentProps {
  activeGoals: Goal[];
  selectedGoalId: string | null;
  getGoalProgress: (goalId: string) => { percent: number } | null;
  onSelect: (goalId: string | null) => void;
}

function GoalPickerContent({
  activeGoals,
  selectedGoalId,
  getGoalProgress,
  onSelect,
}: GoalPickerContentProps): React.ReactElement {
  return (
    <PopoverContent className="min-w-[220px] py-1 bg-surface/95 backdrop-blur-xl">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-variant ${
          !selectedGoalId ? 'bg-primary-50 text-primary-700 font-medium' : 'text-primary'
        }`}
      >
        <span className="flex-1">No goal</span>
        {!selectedGoalId && <Check className="w-4 h-4 text-primary-600" />}
      </button>

      <div className="border-t border-border my-1" />

      {activeGoals.map((goal) => {
        const progress = getGoalProgress(goal.id);
        const percent = progress?.percent ?? 0;
        const isSelected = selectedGoalId === goal.id;

        return (
          <button
            key={goal.id}
            type="button"
            onClick={() => onSelect(goal.id)}
            className={`w-full flex items-center gap-2 px-3 py-2 text-left text-sm transition-colors hover:bg-surface-variant ${
              isSelected ? 'bg-primary-50 text-primary-700 font-medium' : 'text-primary'
            }`}
          >
            <Flag className="w-4 h-4 text-primary-600 flex-shrink-0" />
            <span className="flex-1 truncate">{goal.text}</span>
            <span className="text-xs text-secondary flex-shrink-0">{percent}%</span>
            {isSelected && <Check className="w-4 h-4 text-primary-600 flex-shrink-0" />}
          </button>
        );
      })}
    </PopoverContent>
  );
}

interface SelectedGoalIndicatorProps {
  goalText: string;
  variant: GoalInputVariant;
  onRemove: () => void;
}

const INDICATOR_STYLES: Record<
  GoalInputVariant,
  { container: string; button: string; label: string; textShadow: string | undefined }
> = {
  minimal: {
    container: 'flex items-center gap-1 text-xs text-white/80 mt-2',
    button: 'ml-1 text-white/60 hover:text-white underline',
    label: 'Linked to:',
    textShadow: '0 1px 2px rgba(0,0,0,0.3)',
  },
  boxed: {
    container: 'flex items-center gap-1 text-xs text-primary-600',
    button: 'ml-1 text-secondary hover:text-primary underline',
    label: 'Will link to:',
    textShadow: undefined,
  },
  widget: {
    container: 'flex items-center gap-1 text-xs text-primary-600 mt-1',
    button: 'ml-1 text-secondary hover:text-primary underline',
    label: 'Will link to:',
    textShadow: undefined,
  },
};

function SelectedGoalIndicator({
  goalText,
  variant,
  onRemove,
}: SelectedGoalIndicatorProps): React.ReactElement {
  const styles = INDICATOR_STYLES[variant];

  return (
    <div className={styles.container} style={{ textShadow: styles.textShadow }}>
      <Link2 className="w-3 h-3" />
      <span>
        {styles.label} {goalText}
      </span>
      <button type="button" onClick={onRemove} className={styles.button}>
        Remove
      </button>
    </div>
  );
}

interface GoalLinkButtonProps {
  variant: GoalInputVariant;
  isSelected: boolean;
  selectedGoalText?: string;
}

const LINK_BUTTON_STYLES: Record<
  GoalInputVariant,
  { base: string; selected: string; unselected: string }
> = {
  minimal: {
    base: 'p-2 rounded-full transition-all',
    selected: 'bg-primary-500/80 text-white',
    unselected: 'text-white/60 hover:text-white hover:bg-white/10',
  },
  boxed: {
    base: 'p-3 rounded-lg border-2 transition-all',
    selected: 'bg-primary-50 border-primary-500 text-primary-600',
    unselected: 'border-border text-secondary hover:border-primary-300 hover:text-primary-500',
  },
  widget: {
    base: 'px-2.5 py-2 rounded-xl border transition-all flex items-center justify-center',
    selected: 'bg-primary-50 border-primary-400 text-primary-600',
    unselected:
      'bg-surface-variant/50 border-border text-secondary hover:border-primary-300 hover:text-primary-500',
  },
};

function GoalLinkButton({
  variant,
  isSelected,
  selectedGoalText,
}: GoalLinkButtonProps): React.ReactElement {
  const styles = LINK_BUTTON_STYLES[variant];
  const title = isSelected ? `Linked to: ${selectedGoalText ?? 'Goal'}` : 'Link to goal';

  return (
    <button
      type="button"
      className={`${styles.base} ${isSelected ? styles.selected : styles.unselected}`}
      title={title}
    >
      <Link2 className="w-5 h-5" />
    </button>
  );
}

interface GoalPickerProps {
  variant: GoalInputVariant;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  activeGoals: Goal[];
  selectedGoalId: string | null;
  selectedGoalText?: string;
  getGoalProgress: (goalId: string) => { percent: number } | null;
  onSelect: (goalId: string | null) => void;
}

function GoalPicker({
  variant,
  isOpen,
  onOpenChange,
  activeGoals,
  selectedGoalId,
  selectedGoalText,
  getGoalProgress,
  onSelect,
}: GoalPickerProps): React.ReactElement {
  return (
    <Popover open={isOpen} onOpenChange={onOpenChange}>
      <PopoverTrigger asChild>
        <GoalLinkButton
          variant={variant}
          isSelected={!!selectedGoalId}
          selectedGoalText={selectedGoalText}
        />
      </PopoverTrigger>
      <GoalPickerContent
        activeGoals={activeGoals}
        selectedGoalId={selectedGoalId}
        getGoalProgress={getGoalProgress}
        onSelect={onSelect}
      />
    </Popover>
  );
}

interface GoalInputProps {
  defaultGoalId?: string;
  onTaskAdded?: () => void;
  autoFocus?: boolean;
  variant?: GoalInputVariant;
}

export function GoalInput({
  defaultGoalId,
  onTaskAdded,
  autoFocus = false,
  variant = 'boxed',
}: GoalInputProps): React.ReactElement {
  const [text, setText] = useState('');
  const [selectedGoalId, setSelectedGoalId] = useState<string | null>(defaultGoalId ?? null);
  const [isPickerOpen, setIsPickerOpen] = useState(false);
  const [isFocused, setIsFocused] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const addTask = useGoalStore((state) => state.addTask);
  const getActiveGoals = useGoalStore((state) => state.getActiveGoals);
  const getGoalProgress = useGoalStore((state) => state.getGoalProgress);

  const activeGoals = getActiveGoals();
  const hasGoals = activeGoals.length > 0;
  const selectedGoal = activeGoals.find((o) => o.id === selectedGoalId);

  useEffect(() => {
    if (autoFocus && inputRef.current) {
      inputRef.current.focus();
    }
  }, [autoFocus]);

  const submitTask = async (): Promise<void> => {
    if (!text.trim()) {
      return;
    }
    const success = await addTask(text, selectedGoalId ?? undefined);
    if (success) {
      setText('');
      if (!defaultGoalId) {
        setSelectedGoalId(null);
      }
      if (onTaskAdded) {
        onTaskAdded();
      }
    }
  };

  const handleSubmit = async (e: React.FormEvent): Promise<void> => {
    e.preventDefault();
    await submitTask();
  };

  const handleKeyDown = async (e: React.KeyboardEvent): Promise<void> => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      await submitTask();
    }
  };

  const handleGoalSelect = (goalId: string | null): void => {
    setSelectedGoalId(goalId);
    setIsPickerOpen(false);
  };

  const textShadow = '0 2px 8px rgba(0,0,0,0.4), 0 1px 2px rgba(0,0,0,0.3)';

  // Minimal variant - for direct background use
  if (variant === 'minimal') {
    return (
      <form onSubmit={handleSubmit} className="flex flex-col items-center">
        <label
          htmlFor="goal-input-minimal"
          className="text-2xl md:text-3xl font-medium text-white mb-4"
          style={{ textShadow }}
        >
          What is your main goal for today?
        </label>

        <div className="relative w-full max-w-lg">
          <input
            id="goal-input-minimal"
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            onFocus={() => setIsFocused(true)}
            onBlur={() => setIsFocused(false)}
            placeholder="Type here and press Enter..."
            className="w-full bg-transparent border-none text-center text-xl md:text-2xl font-semibold text-white placeholder:text-white/50 focus:outline-none pb-2"
            style={{ textShadow }}
            maxLength={200}
          />
          <div
            className={`absolute bottom-0 left-1/2 -translate-x-1/2 h-0.5 bg-white/60 transition-all duration-300 ${
              isFocused || text ? 'w-full' : 'w-3/4'
            }`}
          />
        </div>

        {hasGoals && (
          <div className="mt-4">
            <GoalPicker
              variant="minimal"
              isOpen={isPickerOpen}
              onOpenChange={setIsPickerOpen}
              activeGoals={activeGoals}
              selectedGoalId={selectedGoalId}
              selectedGoalText={selectedGoal?.text}
              getGoalProgress={getGoalProgress}
              onSelect={handleGoalSelect}
            />
          </div>
        )}

        {selectedGoalId && selectedGoal && (
          <SelectedGoalIndicator
            goalText={selectedGoal.text}
            variant="minimal"
            onRemove={() => setSelectedGoalId(null)}
          />
        )}
      </form>
    );
  }

  // Widget variant - soft pill add-row matching the goals-widget design
  if (variant === 'widget') {
    return (
      <form onSubmit={handleSubmit} className="space-y-1">
        <div className="flex gap-2">
          <input
            ref={inputRef}
            type="text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Add a goal…"
            className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-border bg-surface-variant/50 focus:border-primary-400 focus:outline-none transition-colors text-sm text-primary placeholder:text-tertiary"
            maxLength={200}
          />

          {hasGoals && (
            <GoalPicker
              variant="widget"
              isOpen={isPickerOpen}
              onOpenChange={setIsPickerOpen}
              activeGoals={activeGoals}
              selectedGoalId={selectedGoalId}
              selectedGoalText={selectedGoal?.text}
              getGoalProgress={getGoalProgress}
              onSelect={handleGoalSelect}
            />
          )}

          <button
            type="submit"
            disabled={!text.trim()}
            className="px-3.5 py-2 rounded-xl border border-border bg-surface-variant/70 hover:bg-surface-variant text-primary text-sm font-medium flex items-center gap-1.5 disabled:opacity-50 disabled:cursor-not-allowed transition-all"
          >
            <Plus className="w-4 h-4" />
            <span>Add</span>
          </button>
        </div>

        {selectedGoalId && selectedGoal && (
          <SelectedGoalIndicator
            goalText={selectedGoal.text}
            variant="widget"
            onRemove={() => setSelectedGoalId(null)}
          />
        )}
      </form>
    );
  }

  // Boxed variant - for panels/modals
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
          className="flex-1 min-w-[280px] px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-secondary bg-surface/50"
          maxLength={200}
        />

        {hasGoals && (
          <GoalPicker
            variant="boxed"
            isOpen={isPickerOpen}
            onOpenChange={setIsPickerOpen}
            activeGoals={activeGoals}
            selectedGoalId={selectedGoalId}
            selectedGoalText={selectedGoal?.text}
            getGoalProgress={getGoalProgress}
            onSelect={handleGoalSelect}
          />
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

      {selectedGoalId && selectedGoal && (
        <SelectedGoalIndicator
          goalText={selectedGoal.text}
          variant="boxed"
          onRemove={() => setSelectedGoalId(null)}
        />
      )}
    </form>
  );
}
