/**
 * Sounds Panel Content
 *
 * Content for the sounds popover with tabs for YouTube, Soundscapes, and Now Playing.
 * Designed to be used inside a PopoverContent component.
 */

import { cn } from '@cuewise/ui';
import { Music, PlayCircle, TreePine } from 'lucide-react';
import type React from 'react';
import { useSoundsStore } from '../../stores/sounds-store';
import { NowPlayingTab } from './NowPlayingTab';
import { SoundscapesTab } from './SoundscapesTab';
import { YouTubeTab } from './YouTubeTab';

export const SoundsPanel: React.FC = () => {
  const activeTab = useSoundsStore((state) => state.activeTab);
  const setActiveTab = useSoundsStore((state) => state.setActiveTab);
  const activeSource = useSoundsStore((state) => state.activeSource);

  // Show Now Playing tab only when YouTube is the active source
  const showNowPlaying = activeSource === 'youtube';

  // Build tabs array dynamically
  const tabs = [
    {
      id: 'youtube' as const,
      label: 'YouTube',
      icon: Music,
    },
    {
      id: 'soundscapes' as const,
      label: 'Sounds',
      icon: TreePine,
    },
    ...(showNowPlaying
      ? [
          {
            id: 'nowPlaying' as const,
            label: 'Playing',
            icon: PlayCircle,
          },
        ]
      : []),
  ];

  // Render the appropriate tab content
  const renderTabContent = () => {
    switch (activeTab) {
      case 'nowPlaying':
        return <NowPlayingTab />;
      case 'soundscapes':
        return <SoundscapesTab />;
      default:
        return <YouTubeTab />;
    }
  };

  return (
    <div className="w-[360px] bg-surface-elevated backdrop-blur-xl">
      {/* Tabs */}
      <div className="flex border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              'flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium transition-colors',
              activeTab === tab.id
                ? 'text-accent border-b-2 border-accent bg-surface-variant/50'
                : 'text-secondary hover:text-primary hover:bg-surface-variant/30'
            )}
          >
            <tab.icon className="w-4 h-4" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      <div className="overflow-y-auto max-h-[400px] p-3">{renderTabContent()}</div>
    </div>
  );
};
