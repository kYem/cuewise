import type { Settings } from '@cuewise/shared';
import { cn } from '@cuewise/ui';
import { ArrowRight, Check, Search, X } from 'lucide-react';
import type React from 'react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { usePomodoroStore } from '../stores/pomodoro-store';
import { useSettingsStore } from '../stores/settings-store';
import { useSoundsStore } from '../stores/sounds-store';
import { SETTINGS_SECTIONS, type SectionId } from './settings/SettingsSections';
import { planSettingsSideEffects } from './settings/settings-apply';
import { settingsMatch } from './settings/settings-match';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function SettingsSearch({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <div className="flex items-center gap-2 rounded-[10px] border border-border bg-surface px-2.5 py-2 focus-within:ring-2 focus-within:ring-primary-300">
      <Search className="h-3.5 w-3.5 flex-none text-tertiary" />
      <input
        type="text"
        value={value}
        placeholder="Search settings…"
        onChange={(e) => onChange(e.target.value)}
        className="min-w-0 flex-1 bg-transparent text-[13px] text-primary outline-none placeholder:text-tertiary"
      />
      {value && (
        <button
          type="button"
          aria-label="Clear search"
          onClick={() => onChange('')}
          className="flex flex-none text-tertiary transition-colors hover:text-primary"
        >
          <X className="h-3 w-3" />
        </button>
      )}
    </div>
  );
}

function SavedIndicator({ tick }: { tick: number }) {
  const [pulse, setPulse] = useState(false);
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return undefined;
    }
    setPulse(true);
    const timeout = setTimeout(() => setPulse(false), 1200);
    return () => clearTimeout(timeout);
  }, [tick]);

  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 text-[11.5px] transition-colors',
        pulse ? 'text-success' : 'text-tertiary'
      )}
    >
      <Check className="h-3 w-3" />
      Changes save automatically
    </span>
  );
}

export const SettingsModal: React.FC<SettingsModalProps> = ({ isOpen, onClose }) => {
  const { settings, updateSettings, resetToDefaults } = useSettingsStore();
  const reloadPomodoroSettings = usePomodoroStore((state) => state.reloadSettings);
  const openSoundsPanel = useSoundsStore((state) => state.openPanel);

  const [active, setActive] = useState<SectionId>('timer');
  const [query, setQuery] = useState('');
  const [savedTick, setSavedTick] = useState(0);
  const bodyRef = useRef<HTMLDivElement>(null);

  // Instant-save: persist immediately, then run the sync-reload or pomodoro-reload side effects.
  const apply = useCallback(
    async (patch: Partial<Settings>) => {
      const prevSyncEnabled = settings.syncEnabled;
      await updateSettings(patch);
      setSavedTick((t) => t + 1);

      const nextSyncEnabled = useSettingsStore.getState().settings.syncEnabled;
      const effects = planSettingsSideEffects(patch, prevSyncEnabled, nextSyncEnabled);
      if (effects.reload) {
        window.location.reload();
        return;
      }
      if (effects.reloadPomodoro) {
        await reloadPomodoroSettings();
      }
    },
    [settings.syncEnabled, updateSettings, reloadPomodoroSettings]
  );

  const set = useCallback(
    (patch: Partial<Settings>) => {
      void apply(patch);
    },
    [apply]
  );

  const handleReset = useCallback(async () => {
    await resetToDefaults();
    await reloadPomodoroSettings();
    setSavedTick((t) => t + 1);
  }, [resetToDefaults, reloadPomodoroSettings]);

  const handleOpenSoundsPanel = useCallback(() => {
    openSoundsPanel();
    onClose();
  }, [openSoundsPanel, onClose]);

  // Close on Escape and lock body scroll while open.
  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleEscape);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  // Reset scroll to top when switching section or entering/leaving search.
  useEffect(() => {
    if (bodyRef.current) {
      bodyRef.current.scrollTop = 0;
    }
  }, [active, query]);

  if (!isOpen) {
    return null;
  }

  const searching = query.trim().length > 0;
  const matched = SETTINGS_SECTIONS.filter((sec) => settingsMatch(query, sec.label, sec.terms));
  const activeSection = SETTINGS_SECTIONS.find((sec) => sec.id === active) ?? SETTINGS_SECTIONS[0];

  const renderSection = (sec: (typeof SETTINGS_SECTIONS)[number], filter: string) => {
    const Section = sec.component;
    return (
      <Section
        s={settings}
        set={set}
        filter={filter}
        onReset={handleReset}
        onOpenSoundsPanel={handleOpenSoundsPanel}
      />
    );
  };

  const jumpToSection = (id: SectionId) => {
    setQuery('');
    setActive(id);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-6 animate-fade-in">
      <button
        type="button"
        aria-label="Close settings"
        tabIndex={-1}
        onClick={onClose}
        className="absolute inset-0 cursor-default bg-black/40 backdrop-blur-sm"
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="Settings"
        className="relative flex h-[min(620px,88vh)] w-[min(880px,94vw)] flex-col overflow-hidden rounded-2xl border border-border bg-surface-elevated shadow-2xl backdrop-blur-xl animate-slide-up"
      >
        {/* Header */}
        <header className="flex flex-none items-center gap-4 border-b border-divider px-5 py-4">
          <h2 className="mr-auto text-xl font-semibold text-primary">Settings</h2>
          <button
            type="button"
            aria-label="Close settings"
            onClick={onClose}
            className="flex h-8 w-8 items-center justify-center rounded-full border border-border bg-surface text-primary transition-colors hover:bg-surface-variant"
          >
            <X className="h-4 w-4" />
          </button>
        </header>

        <div className="flex min-h-0 flex-1">
          {/* Sidebar */}
          <aside className="flex w-[210px] flex-none flex-col gap-3 border-r border-divider p-3">
            <SettingsSearch value={query} onChange={setQuery} />
            <nav aria-label="Settings sections" className="flex flex-col gap-0.5">
              {SETTINGS_SECTIONS.map((sec) => {
                const isActive = !searching && active === sec.id;
                return (
                  <button
                    key={sec.id}
                    type="button"
                    onClick={() => jumpToSection(sec.id)}
                    className={cn(
                      'flex w-full items-center gap-2.5 rounded-[10px] px-3 py-2.5 text-left text-[13.5px] font-medium transition-colors',
                      isActive
                        ? 'bg-surface-variant font-semibold text-primary'
                        : 'text-secondary hover:bg-surface-variant hover:text-primary'
                    )}
                  >
                    <sec.icon className="h-[15px] w-[15px] flex-none" />
                    {sec.label}
                  </button>
                );
              })}
            </nav>
            <div className="mt-auto px-3 py-1.5 text-[11.5px] text-tertiary">
              {__APP_NAME__}{' '}
              <a
                href="https://github.com/kYem/cuewise/blob/main/apps/browser-extension/CHANGELOG.md"
                target="_blank"
                rel="noopener noreferrer"
                className="text-primary transition-colors hover:underline"
              >
                v{__APP_VERSION__}
              </a>
            </div>
          </aside>

          {/* Body */}
          <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5">
            {searching ? (
              matched.length === 0 ? (
                <div className="flex flex-col items-center gap-3 py-16 text-center text-sm text-tertiary">
                  <Search className="h-6 w-6 opacity-60" />
                  <p>No settings match “{query.trim()}”</p>
                </div>
              ) : (
                matched.map((sec) => (
                  <div key={sec.id} className="mb-5">
                    <button
                      type="button"
                      onClick={() => jumpToSection(sec.id)}
                      className="mb-1 flex items-center gap-2 py-1 text-[11px] font-semibold uppercase tracking-[0.08em] text-secondary transition-colors hover:text-primary"
                    >
                      <sec.icon className="h-3 w-3" />
                      {sec.label}
                      <ArrowRight className="h-2.5 w-2.5 text-tertiary" />
                    </button>
                    {renderSection(sec, query)}
                  </div>
                ))
              )
            ) : (
              <>
                <h3 className="mb-2 text-base font-semibold text-primary">{activeSection.label}</h3>
                {renderSection(activeSection, '')}
              </>
            )}
          </div>
        </div>

        {/* Footer */}
        <footer className="flex flex-none justify-end border-t border-divider px-5 py-2.5">
          <SavedIndicator tick={savedTick} />
        </footer>
      </div>
    </div>,
    document.body
  );
};
