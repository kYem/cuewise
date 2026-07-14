import { useGoalStore } from '../../stores/goal-store';

/**
 * "Focusing on" line for focus mode: the next incomplete Today's Focus task,
 * completable in place — ticking the circle advances to the next task.
 * Hidden when there are no tasks or everything is done.
 */
export function FocusModeGoal() {
  const { todayTasks, toggleTask } = useGoalStore();

  const incomplete = todayTasks.filter((task) => !task.completed);
  const current = incomplete[0];
  if (!current) {
    return null;
  }
  const total = todayTasks.length;
  const position = total - incomplete.length + 1;

  return (
    <div className="mt-6 flex flex-col items-center gap-1.5">
      <div className="flex items-baseline gap-3 drop-shadow">
        <span className="text-xs uppercase tracking-widest text-white/60">Focusing on</span>
        <span className="text-xs tabular-nums text-white/50">
          {position} of {total}
        </span>
      </div>
      <div className="flex items-center gap-2.5">
        <button
          type="button"
          onClick={() => toggleTask(current.id)}
          aria-label={`Mark "${current.text}" complete`}
          className="h-5 w-5 flex-shrink-0 rounded-full border-2 border-white/60 transition-colors hover:border-white hover:bg-white/20"
        />
        <span className="max-w-md truncate text-lg text-white/90 drop-shadow-lg">
          {current.text}
        </span>
      </div>
    </div>
  );
}
