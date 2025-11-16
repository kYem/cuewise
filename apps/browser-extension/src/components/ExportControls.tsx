import { Download, FileDown, FileJson } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';

interface ExportControlsProps {
  onExportJSON: () => void;
  onExportCSV: (type: 'daily' | 'weekly' | 'monthly' | 'goals' | 'pomodoros') => void;
  onExportAllJSON: () => void;
}

export const ExportControls: React.FC<ExportControlsProps> = ({
  onExportJSON,
  onExportCSV,
  onExportAllJSON,
}) => {
  const [showDropdown, setShowDropdown] = useState(false);

  return (
    <div className="bg-white rounded-xl shadow-lg p-6">
      <h2 className="text-xl font-bold text-gray-800 mb-4 flex items-center gap-2">
        <Download className="w-5 h-5 text-purple-600" />
        Export Reports
      </h2>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Export Analytics as JSON */}
        <button
          type="button"
          onClick={onExportJSON}
          className="flex items-center gap-3 p-4 border-2 border-purple-200 rounded-lg hover:border-purple-400 hover:bg-purple-50 transition-all"
        >
          <FileJson className="w-6 h-6 text-purple-600" />
          <div className="text-left">
            <div className="font-semibold text-gray-800">Analytics JSON</div>
            <div className="text-xs text-gray-600">Export insights & analytics</div>
          </div>
        </button>

        {/* Export All Data as JSON */}
        <button
          type="button"
          onClick={onExportAllJSON}
          className="flex items-center gap-3 p-4 border-2 border-blue-200 rounded-lg hover:border-blue-400 hover:bg-blue-50 transition-all"
        >
          <FileJson className="w-6 h-6 text-blue-600" />
          <div className="text-left">
            <div className="font-semibold text-gray-800">Complete Export</div>
            <div className="text-xs text-gray-600">All data including quotes</div>
          </div>
        </button>

        {/* CSV Export Dropdown */}
        <div className="relative md:col-span-2">
          <button
            type="button"
            onClick={() => setShowDropdown(!showDropdown)}
            className="w-full flex items-center gap-3 p-4 border-2 border-green-200 rounded-lg hover:border-green-400 hover:bg-green-50 transition-all"
          >
            <FileDown className="w-6 h-6 text-green-600" />
            <div className="flex-1 text-left">
              <div className="font-semibold text-gray-800">Export as CSV</div>
              <div className="text-xs text-gray-600">Select data type to export</div>
            </div>
            <svg
              className={`w-5 h-5 text-gray-600 transition-transform ${showDropdown ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M19 9l-7 7-7-7"
              />
            </svg>
          </button>

          {/* Dropdown Menu */}
          {showDropdown && (
            <div className="absolute top-full left-0 right-0 mt-2 bg-white border-2 border-gray-200 rounded-lg shadow-xl z-10">
              <button
                type="button"
                onClick={() => {
                  onExportCSV('daily');
                  setShowDropdown(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <div className="font-medium text-gray-800">Daily Trends</div>
                <div className="text-xs text-gray-600">Last 30 days of data</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportCSV('weekly');
                  setShowDropdown(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <div className="font-medium text-gray-800">Weekly Trends</div>
                <div className="text-xs text-gray-600">Last 12 weeks of data</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportCSV('monthly');
                  setShowDropdown(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <div className="font-medium text-gray-800">Monthly Trends</div>
                <div className="text-xs text-gray-600">Last 6 months of data</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportCSV('goals');
                  setShowDropdown(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors border-b border-gray-100"
              >
                <div className="font-medium text-gray-800">Goals</div>
                <div className="text-xs text-gray-600">All goals data</div>
              </button>
              <button
                type="button"
                onClick={() => {
                  onExportCSV('pomodoros');
                  setShowDropdown(false);
                }}
                className="w-full px-4 py-3 text-left hover:bg-gray-50 transition-colors"
              >
                <div className="font-medium text-gray-800">Pomodoro Sessions</div>
                <div className="text-xs text-gray-600">All session data</div>
              </button>
            </div>
          )}
        </div>
      </div>

      <div className="mt-4 p-3 bg-blue-50 rounded-lg">
        <p className="text-xs text-gray-700">
          <span className="font-semibold">Tip:</span> Export your data regularly to track your
          long-term progress and maintain backups.
        </p>
      </div>
    </div>
  );
};
