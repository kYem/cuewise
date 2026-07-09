import type { StorageUsageInfo } from '@cuewise/storage';
import { formatBytes, getStorageUsage } from '@cuewise/storage';
import { AlertTriangle, Database, Info } from 'lucide-react';
import type React from 'react';
import { useEffect, useState } from 'react';

interface StorageIndicatorProps {
  /**
   * Display mode: 'compact' shows minimal info, 'full' shows detailed breakdown
   */
  mode?: 'compact' | 'full';
}

export const StorageIndicator: React.FC<StorageIndicatorProps> = ({ mode = 'full' }) => {
  const [usage, setUsage] = useState<StorageUsageInfo | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    loadStorageUsage();

    // Refresh usage every 30 seconds
    const interval = setInterval(loadStorageUsage, 30000);
    return () => clearInterval(interval);
  }, []);

  const loadStorageUsage = async () => {
    const usageInfo = await getStorageUsage();
    setUsage(usageInfo);
    setIsLoading(false);
  };

  if (isLoading || !usage) {
    return (
      <div className="flex items-center gap-2 text-sm text-secondary">
        <Database className="w-4 h-4 animate-pulse" />
        <span>Loading storage info...</span>
      </div>
    );
  }

  // Determine color scheme based on usage
  const getColorClasses = () => {
    if (usage.isCritical) {
      return {
        bg: 'bg-red-500',
        text: 'text-red-700',
        border: 'border-red-200',
        bgLight: 'bg-red-50',
        icon: 'text-red-600',
      };
    }
    if (usage.isWarning) {
      return {
        bg: 'bg-yellow-500',
        text: 'text-yellow-700',
        border: 'border-yellow-200',
        bgLight: 'bg-yellow-50',
        icon: 'text-yellow-600',
      };
    }
    return {
      bg: 'bg-primary-600',
      text: 'text-primary-700',
      border: 'border-primary-200',
      bgLight: 'bg-primary-50',
      icon: 'text-primary-600',
    };
  };

  const colors = getColorClasses();

  if (mode === 'compact') {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Database className={`w-4 h-4 ${colors.icon}`} />
        <div className="flex-1">
          <div className="w-full bg-divider rounded-full h-2">
            <div
              className={`${colors.bg} h-2 rounded-full transition-all duration-300`}
              style={{ width: `${Math.min(usage.percentageUsed, 100)}%` }}
            />
          </div>
        </div>
        <span className={`text-xs font-medium ${colors.text}`}>
          {usage.percentageUsed.toFixed(1)}%
        </span>
      </div>
    );
  }

  return (
    <section>
      <div className="flex items-center gap-2 mb-4">
        <Database className={`w-5 h-5 ${colors.icon}`} />
        <h3 className="text-lg font-semibold text-primary">Storage Usage</h3>
      </div>

      <div className="space-y-4 pl-7">
        {/* Warning message if storage is high */}
        {usage.isCritical && (
          <div
            className={`flex items-start gap-3 p-4 ${colors.bgLight} ${colors.border} border rounded-lg`}
          >
            <AlertTriangle className={`w-5 h-5 ${colors.icon} flex-shrink-0 mt-0.5`} />
            <div>
              <p className={`text-sm font-medium ${colors.text}`}>Critical: Storage Almost Full</p>
              <p className="text-xs text-secondary mt-1">
                You're using over 90% of available storage. Consider cleaning up old goals or quotes
                to free up space.
              </p>
            </div>
          </div>
        )}

        {usage.isWarning && !usage.isCritical && (
          <div
            className={`flex items-start gap-3 p-4 ${colors.bgLight} ${colors.border} border rounded-lg`}
          >
            <Info className={`w-5 h-5 ${colors.icon} flex-shrink-0 mt-0.5`} />
            <div>
              <p className={`text-sm font-medium ${colors.text}`}>Storage Running Low</p>
              <p className="text-xs text-secondary mt-1">
                You're using over 75% of available storage. Consider cleaning up old data if you
                notice performance issues.
              </p>
            </div>
          </div>
        )}

        {/* Progress bar */}
        <div>
          <div className="flex items-center justify-between mb-2">
            <span className="text-sm font-medium text-primary">Used Space</span>
            <span className={`text-sm font-semibold ${colors.text}`}>
              {formatBytes(usage.bytesInUse)} / {formatBytes(usage.quota)}
            </span>
          </div>

          <div className="w-full bg-divider rounded-full h-3 overflow-hidden">
            <div
              className={`${colors.bg} h-3 rounded-full transition-all duration-500 ease-out`}
              style={{ width: `${Math.min(usage.percentageUsed, 100)}%` }}
            />
          </div>

          <div className="flex items-center justify-between mt-1">
            <span className="text-xs text-secondary">{usage.percentageUsed.toFixed(2)}% used</span>
            <span className="text-xs text-secondary">
              {formatBytes(usage.quota - usage.bytesInUse)} free
            </span>
          </div>
        </div>

        {/* Info note */}
        {!usage.isWarning && (
          <div className="flex items-start gap-2 text-xs text-secondary">
            <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Chrome extensions have a 10MB storage limit for local data. This includes all your
              quotes, goals, reminders, and settings.
            </p>
          </div>
        )}
      </div>
    </section>
  );
};
