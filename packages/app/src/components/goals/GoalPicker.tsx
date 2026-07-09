import { Select, type SelectOption } from '@cuewise/ui';
import { Flag } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useGoalStore } from '../../stores/goal-store';

interface GoalPickerProps {
  value: string | null;
  onChange: (goalId: string | null) => void;
  placeholder?: string;
  disabled?: boolean;
  autoOpen?: boolean;
}

export const GoalPicker: React.FC<GoalPickerProps> = ({
  value,
  onChange,
  placeholder = 'Link to goal...',
  disabled = false,
  autoOpen = false,
}) => {
  const getActiveGoals = useGoalStore((state) => state.getActiveGoals);
  const getGoalProgress = useGoalStore((state) => state.getGoalProgress);

  const goals = getActiveGoals();

  const options = useMemo<SelectOption<string>[]>(() => {
    const baseOptions: SelectOption<string>[] = [
      {
        value: '',
        label: 'No goal',
      },
    ];

    const goalOptions: SelectOption<string>[] = goals.map((obj) => {
      const progress = getGoalProgress(obj.id);
      const percent = progress?.percent ?? 0;

      return {
        value: obj.id,
        label: obj.text,
        icon: <Flag className="w-4 h-4 text-primary-600" />,
        badge: `${percent}%`,
      };
    });

    return [...baseOptions, ...goalOptions];
  }, [goals, getGoalProgress]);

  const handleChange = (selectedValue: string) => {
    onChange(selectedValue === '' ? null : selectedValue);
  };

  if (goals.length === 0) {
    return null;
  }

  return (
    <Select
      value={value ?? ''}
      onChange={handleChange}
      options={options}
      placeholder={placeholder}
      disabled={disabled}
      autoOpen={autoOpen}
    />
  );
};
