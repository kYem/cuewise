import { getStorageUsage, type StorageUsageInfo } from '@cuewise/storage';
import { Target } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useGoalStore } from '../stores/goal-store';
import { ErrorFallback } from './ErrorFallback';
import { GoalInput } from './GoalInput';
import { GoalsList } from './GoalsList';
import { StorageIndicator } from './StorageIndicator';

export const GoalsSection: React.FC = () => {
  const { initialize, isLoading, error } = useGoalStore();
  const [storageUsage, setStorageUsage] = useState<StorageUsageInfo | null>(null);

  useEffect(() => {
    initialize();
    loadStorageInfo();
  }, [initialize]);

  const loadStorageInfo = async () => {
    const usage = await getStorageUsage();
    setStorageUsage(usage);
  };

  if (isLoading) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-border">
          <div className="flex items-center justify-center min-h-[200px]">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full max-w-2xl mx-auto">
        <div className="bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-border">
          <ErrorFallback error={error} title="Failed to load goals" onRetry={initialize} />
        </div>
      </div>
    );
  }

  return (
    <div className="w-full max-w-2xl mx-auto">
      <div className="bg-surface/80 backdrop-blur-sm rounded-2xl shadow-lg p-6 border border-border min-h-[400px] flex flex-col">
        {/* Header */}
        <div className="flex items-center gap-3 mb-6">
          <div className="p-2 bg-primary-100 rounded-lg">
            <Target className="w-6 h-6 text-primary-600" />
          </div>
          <div>
            <h2 className="text-2xl font-semibold text-primary">Today's Focus</h2>
            <p className="text-sm text-secondary">What matters most today?</p>
          </div>
        </div>

        {/* Goal Input */}
        <div className="mb-6">
          <GoalInput />
        </div>

        {/* Storage Warning - only show if warning or critical */}
        {storageUsage && (storageUsage.isWarning || storageUsage.isCritical) && (
          <div className="mb-4">
            <StorageIndicator mode="compact" />
          </div>
        )}

        {/* Goals List */}
        <div className="flex-1">
          <GoalsList />
        </div>
      </div>
    </div>
  );
};
