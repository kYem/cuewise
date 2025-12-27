import { Select, type SelectOption } from '@cuewise/ui';
import { Flag } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useGoalStore } from '../../stores/goal-store';

interface GoalPickerProps {
  value: string | null;
  onChange: (objectiveId: string | null) => void;
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
  const getObjectiveProgress = useGoalStore((state) => state.getObjectiveProgress);

  const objectives = getActiveGoals();

  const options = useMemo<SelectOption<string>[]>(() => {
    const baseOptions: SelectOption<string>[] = [
      {
        value: '',
        label: 'No goal',
      },
    ];

    const objectiveOptions: SelectOption<string>[] = objectives.map((obj) => {
      const progress = getObjectiveProgress(obj.id);
      const percent = progress?.percent ?? 0;

      return {
        value: obj.id,
        label: obj.text,
        icon: <Flag className="w-4 h-4 text-primary-600" />,
        badge: `${percent}%`,
      };
    });

    return [...baseOptions, ...objectiveOptions];
  }, [objectives, getObjectiveProgress]);

  const handleChange = (selectedValue: string) => {
    onChange(selectedValue === '' ? null : selectedValue);
  };

  if (objectives.length === 0) {
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
