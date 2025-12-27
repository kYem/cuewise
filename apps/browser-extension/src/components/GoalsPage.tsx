import { getObjectives, getTodayDateString, isTask } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { Calendar, CheckCircle2, Circle, Flag, ListTodo, Target, TrendingUp } from 'lucide-react';
import type React from 'react';
import { useEffect, useMemo, useState } from 'react';
import { type CompletionFilter, useGoalStore } from '../stores/goal-store';
import { AllGoalsList } from './AllGoalsList';
import { GoalsSection } from './goals';
import { PageHeader } from './PageHeader';

type ViewTab = 'tasks' | 'goals';

export const GoalsPage: React.FC = () => {
  const { goals, isLoading, initialize, completionFilter, setCompletionFilter } = useGoalStore();
  const [newGoalText, setNewGoalText] = useState('');
  const [activeTab, setActiveTab] = useState<ViewTab>('tasks');
  const addGoal = useGoalStore((state) => state.addGoal);

  // Get tasks and objectives counts
  const tasks = useMemo(() => goals.filter(isTask), [goals]);
  const objectives = useMemo(() => getObjectives(goals), [goals]);

  useEffect(() => {
    initialize();
  }, [initialize]);

  // Calculate stats (only for tasks, not objectives)
  const stats = useMemo(() => {
    const today = getTodayDateString();
    const totalGoals = tasks.length;
    const completedGoals = tasks.filter((g) => g.completed).length;
    const incompleteGoals = totalGoals - completedGoals;
    const completionRate = totalGoals > 0 ? Math.round((completedGoals / totalGoals) * 100) : 0;

    // Goals by time period
    const todayGoals = tasks.filter((g) => g.date === today);
    const todayCompleted = todayGoals.filter((g) => g.completed).length;

    // Last 7 days
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
    const sevenDaysAgoStr = sevenDaysAgo.toISOString().split('T')[0];
    const weekGoals = tasks.filter((g) => g.date >= sevenDaysAgoStr);
    const weekCompleted = weekGoals.filter((g) => g.completed).length;

    // Last 30 days
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    const thirtyDaysAgoStr = thirtyDaysAgo.toISOString().split('T')[0];
    const monthGoals = tasks.filter((g) => g.date >= thirtyDaysAgoStr);
    const monthCompleted = monthGoals.filter((g) => g.completed).length;

    return {
      totalGoals,
      completedGoals,
      incompleteGoals,
      completionRate,
      todayGoals: todayGoals.length,
      todayCompleted,
      weekGoals: weekGoals.length,
      weekCompleted,
      monthGoals: monthGoals.length,
      monthCompleted,
    };
  }, [tasks]);

  const handleAddGoal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newGoalText.trim()) {
      await addGoal(newGoalText.trim());
      setNewGoalText('');
    }
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full p-8 bg-background flex items-center justify-center">
        <div className="text-secondary">Loading goals...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen w-full bg-background">
      <PageHeader
        currentPage="goals"
        title="Goals & Tasks"
        subtitle="Track your progress and celebrate achievements"
      />

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* Stats Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
          {/* Today */}
          <div className="bg-surface rounded-xl p-4 border-2 border-border">
            <div className="flex items-center gap-2 mb-2">
              <Target className="w-5 h-5 text-primary-600" />
              <span className="text-sm font-medium text-secondary">Today</span>
            </div>
            <div className="text-2xl font-bold text-primary">
              {stats.todayCompleted}/{stats.todayGoals}
            </div>
            <div className="text-xs text-tertiary">completed</div>
          </div>

          {/* This Week */}
          <div className="bg-surface rounded-xl p-4 border-2 border-border">
            <div className="flex items-center gap-2 mb-2">
              <Calendar className="w-5 h-5 text-blue-500" />
              <span className="text-sm font-medium text-secondary">This Week</span>
            </div>
            <div className="text-2xl font-bold text-primary">
              {stats.weekCompleted}/{stats.weekGoals}
            </div>
            <div className="text-xs text-tertiary">completed</div>
          </div>

          {/* This Month */}
          <div className="bg-surface rounded-xl p-4 border-2 border-border">
            <div className="flex items-center gap-2 mb-2">
              <TrendingUp className="w-5 h-5 text-green-500" />
              <span className="text-sm font-medium text-secondary">This Month</span>
            </div>
            <div className="text-2xl font-bold text-primary">
              {stats.monthCompleted}/{stats.monthGoals}
            </div>
            <div className="text-xs text-tertiary">completed</div>
          </div>

          {/* All Time */}
          <div className="bg-surface rounded-xl p-4 border-2 border-border">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle2 className="w-5 h-5 text-purple-500" />
              <span className="text-sm font-medium text-secondary">All Time</span>
            </div>
            <div className="text-2xl font-bold text-primary">{stats.completionRate}%</div>
            <div className="text-xs text-tertiary">
              {stats.completedGoals} of {stats.totalGoals} goals
            </div>
          </div>
        </div>

        {/* View Tab Switcher */}
        <div className="flex items-center gap-2 mb-6">
          <button
            type="button"
            onClick={() => setActiveTab('tasks')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === 'tasks'
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-surface-variant text-secondary hover:text-primary hover:bg-surface'
            )}
          >
            <ListTodo className="w-4 h-4" />
            <span>Tasks</span>
            <span className="text-xs opacity-75">({tasks.length})</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('goals')}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium transition-all',
              activeTab === 'goals'
                ? 'bg-primary-600 text-white shadow-md'
                : 'bg-surface-variant text-secondary hover:text-primary hover:bg-surface'
            )}
          >
            <Flag className="w-4 h-4" />
            <span>Goals</span>
            <span className="text-xs opacity-75">({objectives.length})</span>
          </button>
        </div>

        {/* Tasks View */}
        {activeTab === 'tasks' && (
          <>
            {/* Add Task Form */}
            <form onSubmit={handleAddGoal} className="mb-8">
              <div className="flex gap-3">
                <div className="flex-1 relative">
                  <Circle className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-tertiary" />
                  <input
                    type="text"
                    value={newGoalText}
                    onChange={(e) => setNewGoalText(e.target.value)}
                    placeholder="Add a new task for today..."
                    maxLength={200}
                    className="w-full pl-12 pr-4 py-3 rounded-lg border-2 border-border bg-surface focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-tertiary"
                  />
                </div>
                <button
                  type="submit"
                  disabled={!newGoalText.trim()}
                  className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all font-medium"
                >
                  Add Task
                </button>
              </div>
            </form>

            {/* Filter Tabs */}
            <div className="flex items-center gap-4 mb-6">
              <span className="text-sm font-medium text-secondary">Filter:</span>
              <div className="flex gap-1 bg-surface-variant rounded-lg p-1">
                {(['all', 'incomplete', 'completed'] as CompletionFilter[]).map((filter) => (
                  <button
                    key={filter}
                    type="button"
                    onClick={() => setCompletionFilter(filter)}
                    className={cn(
                      'px-4 py-2 rounded-md text-sm font-medium transition-all capitalize',
                      completionFilter === filter
                        ? 'bg-primary-600 text-white shadow-md'
                        : 'text-secondary hover:text-primary hover:bg-surface'
                    )}
                  >
                    {filter}
                    {filter === 'incomplete' && stats.incompleteGoals > 0 && (
                      <span className="ml-2 text-xs opacity-75">({stats.incompleteGoals})</span>
                    )}
                    {filter === 'completed' && stats.completedGoals > 0 && (
                      <span className="ml-2 text-xs opacity-75">({stats.completedGoals})</span>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Goals List */}
            <div className="bg-surface rounded-xl border-2 border-border p-6">
              <AllGoalsList />
            </div>
          </>
        )}

        {/* Goals View */}
        {activeTab === 'goals' && (
          <div className="bg-surface rounded-xl border-2 border-border p-6">
            <GoalsSection showCreateButton />
          </div>
        )}
      </div>
    </div>
  );
};
