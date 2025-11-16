import {
  CATEGORY_COLORS,
  formatFocusTime,
  getMostViewedCategory,
  QUOTE_CATEGORIES,
} from '@cuewise/shared';
import {
  ArrowLeft,
  Award,
  BarChart3,
  Calendar,
  Clock,
  Flame,
  Target,
  TrendingUp,
} from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useInsightsStore } from '../stores/insights-store';
import { ExportControls } from './ExportControls';
import { GoalCompletionChart } from './GoalCompletionChart';
import { PomodoroHeatmap } from './PomodoroHeatmap';
import { TrendChart } from './TrendChart';

export const InsightsPage: React.FC = () => {
  const { insights, analytics, isLoading, initialize, exportAsJSON, exportAsCSV, exportAllAsJSON } =
    useInsightsStore();
  const [activeTab, setActiveTab] = useState<'overview' | 'analytics'>('overview');

  useEffect(() => {
    initialize();
  }, [initialize]);

  const handleBackToHome = () => {
    window.location.hash = '';
  };

  if (isLoading) {
    return (
      <div className="min-h-screen w-full p-8 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">Loading insights...</div>
      </div>
    );
  }

  if (!insights) {
    return (
      <div className="min-h-screen w-full p-8 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100 flex items-center justify-center">
        <div className="text-gray-600">No insights available</div>
      </div>
    );
  }

  const mostViewedCategory = getMostViewedCategory(insights.categoryViewCounts);

  // Calculate max count for category heatmap scaling
  const maxCategoryCount = Math.max(...Object.values(insights.categoryViewCounts));

  return (
    <div className="min-h-screen w-full p-8 bg-gradient-to-br from-purple-50 via-blue-50 to-indigo-100">
      {/* Back Button */}
      <button
        type="button"
        onClick={handleBackToHome}
        className="mb-8 flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
      >
        <ArrowLeft className="w-5 h-5" />
        <span>Back to Home</span>
      </button>

      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-4xl font-bold text-gray-800 mb-2 flex items-center gap-3">
            <BarChart3 className="w-10 h-10 text-purple-600" />
            Your Insights
          </h1>
          <p className="text-gray-600">
            Track your productivity journey and celebrate your progress
          </p>
        </div>

        {/* Tab Navigation */}
        <div className="flex gap-2 mb-8">
          <button
            type="button"
            onClick={() => setActiveTab('overview')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'overview'
                ? 'bg-white text-purple-600 shadow-lg'
                : 'bg-white/50 text-gray-600 hover:bg-white/80'
            }`}
          >
            Overview
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('analytics')}
            className={`px-6 py-3 rounded-lg font-semibold transition-all ${
              activeTab === 'analytics'
                ? 'bg-white text-purple-600 shadow-lg'
                : 'bg-white/50 text-gray-600 hover:bg-white/80'
            }`}
          >
            Advanced Analytics
          </button>
        </div>

        {/* Overview Tab */}
        {activeTab === 'overview' && (
          <>
            {/* Stats Grid */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5 gap-6 mb-8">
          {/* Streak Card */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-orange-100 rounded-lg">
                <Flame className="w-6 h-6 text-orange-600" />
              </div>
              <span className="text-3xl font-bold text-orange-600">{insights.streak.current}</span>
            </div>
            <h3 className="text-gray-600 text-sm font-medium mb-1">Current Streak</h3>
            <p className="text-xs text-gray-500">Longest: {insights.streak.longest} days</p>
          </div>

          {/* Goals Today */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-green-100 rounded-lg">
                <Target className="w-6 h-6 text-green-600" />
              </div>
              <span className="text-3xl font-bold text-green-600">
                {insights.goalsCompletedToday}
              </span>
            </div>
            <h3 className="text-gray-600 text-sm font-medium mb-1">Goals Today</h3>
            <p className="text-xs text-gray-500">
              This week: {insights.goalsCompletedThisWeek} | Month:{' '}
              {insights.goalsCompletedThisMonth}
            </p>
          </div>

          {/* Pomodoros Today */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-red-100 rounded-lg">
                <Calendar className="w-6 h-6 text-red-600" />
              </div>
              <span className="text-3xl font-bold text-red-600">
                {insights.pomodorosCompletedToday}
              </span>
            </div>
            <h3 className="text-gray-600 text-sm font-medium mb-1">Pomodoros Today</h3>
            <p className="text-xs text-gray-500">Focus sessions completed</p>
          </div>

          {/* Total Quotes Viewed */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-purple-100 rounded-lg">
                <TrendingUp className="w-6 h-6 text-purple-600" />
              </div>
              <span className="text-3xl font-bold text-purple-600">
                {insights.totalQuotesViewed}
              </span>
            </div>
            <h3 className="text-gray-600 text-sm font-medium mb-1">Quotes Viewed</h3>
            <p className="text-xs text-gray-500">This week: {insights.quotesViewedThisWeek}</p>
          </div>

          {/* Focus Time */}
          <div className="bg-white rounded-xl shadow-lg p-6 hover:shadow-xl transition-shadow">
            <div className="flex items-center justify-between mb-4">
              <div className="p-3 bg-blue-100 rounded-lg">
                <Clock className="w-6 h-6 text-blue-600" />
              </div>
              <span className="text-3xl font-bold text-blue-600">
                {formatFocusTime(insights.focusTimeToday)}
              </span>
            </div>
            <h3 className="text-gray-600 text-sm font-medium mb-1">Focus Time Today</h3>
            <p className="text-xs text-gray-500">
              This week: {formatFocusTime(insights.focusTimeThisWeek)}
            </p>
          </div>
        </div>

        {/* Category Heatmap */}
        <div className="bg-white rounded-xl shadow-lg p-8 mb-8">
          <div className="flex items-center gap-3 mb-6">
            <Award className="w-6 h-6 text-purple-600" />
            <h2 className="text-2xl font-bold text-gray-800">Category Insights</h2>
          </div>

          {mostViewedCategory && (
            <div className="mb-6 p-4 bg-purple-50 rounded-lg">
              <p className="text-sm text-gray-600">
                Your most viewed category is{' '}
                <span className="font-bold text-purple-700">
                  {QUOTE_CATEGORIES[mostViewedCategory.category]}
                </span>{' '}
                with {mostViewedCategory.count} views
              </p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {Object.entries(insights.categoryViewCounts).map(([category, count]) => {
              const categoryKey = category as keyof typeof QUOTE_CATEGORIES;
              const percentage = maxCategoryCount > 0 ? (count / maxCategoryCount) * 100 : 0;

              return (
                <div key={category} className="flex items-center gap-3">
                  <div className="w-32 text-sm font-medium text-gray-700">
                    {QUOTE_CATEGORIES[categoryKey]}
                  </div>
                  <div className="flex-1 h-8 bg-gray-100 rounded-lg overflow-hidden relative">
                    <div
                      className="h-full rounded-lg transition-all duration-500"
                      style={{
                        width: `${percentage}%`,
                        backgroundColor: CATEGORY_COLORS[categoryKey],
                      }}
                    />
                    <div className="absolute inset-0 flex items-center justify-end pr-3">
                      <span className="text-xs font-semibold text-gray-700">{count}</span>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Achievement Summary */}
        <div className="bg-gradient-to-r from-purple-600 to-indigo-600 rounded-xl shadow-lg p-8 text-white">
          <h2 className="text-2xl font-bold mb-4">Your Achievement Summary</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div>
              <div className="text-4xl font-bold mb-2">{insights.streak.longest}</div>
              <div className="text-purple-100">Longest Streak</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">{insights.goalsCompletedThisMonth}</div>
              <div className="text-purple-100">Goals This Month</div>
            </div>
            <div>
              <div className="text-4xl font-bold mb-2">{insights.totalQuotesViewed}</div>
              <div className="text-purple-100">Total Inspiration</div>
            </div>
          </div>
        </div>
          </>
        )}

        {/* Analytics Tab */}
        {activeTab === 'analytics' && analytics && (
          <div className="space-y-8">
            {/* Export Controls */}
            <ExportControls
              onExportJSON={exportAsJSON}
              onExportCSV={exportAsCSV}
              onExportAllJSON={exportAllAsJSON}
            />

            {/* Goal Completion Rate */}
            <GoalCompletionChart data={analytics.goalCompletionRate} />

            {/* Productivity Trends */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
              {/* Daily Trends */}
              <TrendChart
                title="Daily Trends (Last 30 Days)"
                data={analytics.dailyTrends.map((d) => ({
                  label: new Date(d.date).toLocaleDateString('en-US', {
                    month: 'short',
                    day: 'numeric',
                  }),
                  goalsCompleted: d.goalsCompleted,
                  focusTime: d.focusTime,
                  pomodorosCompleted: d.pomodorosCompleted,
                }))}
                metric="goals"
              />

              {/* Weekly Trends */}
              <TrendChart
                title="Weekly Trends (Last 12 Weeks)"
                data={analytics.weeklyTrends.map((w) => ({
                  label: w.weekLabel,
                  goalsCompleted: w.goalsCompleted,
                  focusTime: w.focusTime,
                  pomodorosCompleted: w.pomodorosCompleted,
                }))}
                metric="focus"
              />
            </div>

            {/* Monthly Trends */}
            <TrendChart
              title="Monthly Trends (Last 6 Months)"
              data={analytics.monthlyTrends.map((m) => ({
                label: m.month,
                goalsCompleted: m.goalsCompleted,
                focusTime: m.focusTime,
                pomodorosCompleted: m.pomodorosCompleted,
              }))}
              metric="pomodoros"
            />

            {/* Pomodoro Heatmap */}
            <PomodoroHeatmap data={analytics.pomodoroHeatmap} />
          </div>
        )}
      </div>
    </div>
  );
};
