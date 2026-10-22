import { render } from '@testing-library/react';
import type React from 'react';
import { CompactGoalRow } from '../CompactGoalRow';

type CompactGoalRowProps = React.ComponentProps<typeof CompactGoalRow>;

const noop = () => {};

export function renderCompactRow(
  props: Pick<CompactGoalRowProps, 'goal'> & Partial<CompactGoalRowProps>
) {
  return render(
    <CompactGoalRow
      expanded={false}
      onToggleComplete={noop}
      onToggleExpand={noop}
      onToggleSubtask={noop}
      addingSubtask={false}
      onStartAddingSubtask={noop}
      onStopAddingSubtask={noop}
      onAddSubtask={noop}
      {...props}
    />
  );
}
