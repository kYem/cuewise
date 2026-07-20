import { ToastContainer } from '@cuewise/ui';
import { Coffee } from 'lucide-react';
import { useEffect, useState } from 'react';
import { BackgroundCredit } from './components/BackgroundCredit';
import { ConceptsPage } from './components/ConceptsPage';
import { CelebrationOverlay } from './components/celebration/CelebrationOverlay';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GoalsPage } from './components/GoalsPage';
import { InsightsPage } from './components/InsightsPage';
import { NewTabPage } from './components/NewTabPage';
import { PomodoroPage } from './components/PomodoroPage';
import { QuoteManagementPage } from './components/QuoteManagementPage';
import type { SettingsSection } from './components/settings/SettingsSections';
import { syncSettingsSection } from './components/settings/SyncSettingsSection';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { useDayChange } from './hooks/useDayChange';
import { useBackgroundStore } from './stores/background-store';
import { useGoalStore } from './stores/goal-store';
import { useSettingsStore } from './stores/settings-store';
import { useToastStore } from './stores/toast-store';
import { type SyncController, SyncControllerContext } from './sync/sync-controller';
import {
  getPreloadedCurrentUrl,
  preloadImages,
  refreshBackground,
} from './utils/image-preload-cache';
import { loadImageWithFallback } from './utils/unsplash';

type Page = 'home' | 'pomodoro' | 'insights' | 'quotes' | 'goals' | 'concepts';

interface AppProps {
  /** Platform-specific settings sections injected by the host (macOS Posture). */
  extraSections?: SettingsSection[];
  /** Platform sync adapter (Task 4 seam); when present the Cloud Sync section is injected. */
  syncController?: SyncController | null;
}

function App({ extraSections, syncController }: AppProps = {}) {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const { toasts, removeToast } = useToastStore();
  const { settings } = useSettingsStore();
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [isRefreshingBackground, setIsRefreshingBackground] = useState(false);
  const customBackground = useBackgroundStore((s) => s.customBackground);
  const isCustomBackgroundLoaded = useBackgroundStore((s) => s.isLoaded);
  const loadCustomBackground = useBackgroundStore((s) => s.loadCustomBackground);

  // Show background image only when glass theme is selected
  const showBackgroundImage = settings.colorTheme === 'glass';

  // Only hide content while glass theme background loads (not during settings load)
  // This allows the default theme to show while waiting for the background image
  const hideContent = showBackgroundImage && !imageLoaded;

  // Goals are day-scoped: refresh Today and roll newly due tasks at midnight.
  useDayChange(() => useGoalStore.getState().handleDayRollover());

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'pomodoro') {
        setCurrentPage('pomodoro');
      } else if (hash === 'insights') {
        setCurrentPage('insights');
      } else if (hash === 'quotes') {
        setCurrentPage('quotes');
      } else if (hash === 'goals') {
        setCurrentPage('goals');
      } else if (hash === 'concepts') {
        setCurrentPage('concepts');
      } else {
        setCurrentPage('home');
      }
    };

    // Set initial page based on hash
    handleHashChange();

    // Listen for hash changes
    window.addEventListener('hashchange', handleHashChange);

    return () => {
      window.removeEventListener('hashchange', handleHashChange);
    };
  }, []);

  useEffect(() => {
    loadCustomBackground();
  }, [loadCustomBackground]);

  // Load background image when glass theme is selected
  useEffect(() => {
    if (!showBackgroundImage) {
      setBackgroundImage(null);
      setImageLoaded(false);
      return;
    }

    // Wait for storage rather than flashing a curated photo over the user's own image.
    if (!isCustomBackgroundLoaded) {
      return;
    }

    if (customBackground !== null) {
      setBackgroundImage(customBackground);
      setImageLoaded(true);
      return;
    }

    let cancelled = false;

    const loadBackground = async () => {
      // Preload images first (loads from storage or gets new image)
      // This persists the daily background so it only changes once per day
      await preloadImages(settings.focusModeImageCategory);

      if (cancelled) {
        return;
      }

      // Get the image URL (either preloaded or fetch new one)
      let imageUrl: string | null = null;

      // Check if we have a preloaded image from the cache
      const preloadedUrl = getPreloadedCurrentUrl(settings.focusModeImageCategory);
      if (preloadedUrl) {
        imageUrl = preloadedUrl;
      } else {
        // Fall back to fetching a new image URL
        try {
          imageUrl = await loadImageWithFallback(settings.focusModeImageCategory);
        } catch {
          // Failed to get image URL, show content without background
          if (!cancelled) {
            setImageLoaded(true);
          }
          return;
        }
      }

      if (cancelled || !imageUrl) {
        return;
      }

      // Wait for the actual image to load in the browser
      const img = new Image();
      img.onload = () => {
        if (!cancelled) {
          setBackgroundImage(imageUrl);
          setImageLoaded(true);
        }
      };
      img.onerror = () => {
        // Image failed to load, still show content
        if (!cancelled) {
          setImageLoaded(true);
        }
      };
      img.src = imageUrl;
    };

    loadBackground();

    return () => {
      cancelled = true;
    };
  }, [
    showBackgroundImage,
    settings.focusModeImageCategory,
    customBackground,
    isCustomBackgroundLoaded,
  ]);

  const handleRefreshBackground = async () => {
    setIsRefreshingBackground(true);
    const url = await refreshBackground(settings.focusModeImageCategory);
    // A null url means nothing fresh loaded — leave the current background in place.
    if (url !== null) {
      setBackgroundImage(url);
    }
    setIsRefreshingBackground(false);
  };

  // Inject the Cloud Sync section only when a host actually wires a controller in.
  const effectiveExtraSections = syncController
    ? [syncSettingsSection, ...(extraSections ?? [])]
    : extraSections;

  return (
    <SyncControllerContext.Provider value={syncController ?? null}>
      <ErrorBoundary>
        {/* Skip to main content link - visible on focus for keyboard users */}
        <a
          href="#main-content"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
        >
          Skip to main content
        </a>

        {/* Glass theme background layers */}
        {showBackgroundImage && (
          <>
            {/* Fallback dark gradient - always visible as base layer */}
            <div className="fixed inset-0 bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900" />

            {/* Background image - fades in when loaded */}
            <div
              className={`fixed inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
                imageLoaded && backgroundImage ? 'opacity-100' : 'opacity-0'
              }`}
              style={{
                backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
              }}
            />

            {settings.glassEnhanced && (
              <div
                className="fixed inset-0 pointer-events-none"
                style={{ background: 'var(--glass-scrim)' }}
              />
            )}

            {/* Dark overlay for better readability on content-heavy pages (not home/pomodoro) */}
            {(currentPage === 'goals' ||
              currentPage === 'quotes' ||
              currentPage === 'insights' ||
              currentPage === 'concepts') && <div className="fixed inset-0 bg-black/25" />}

            {imageLoaded && (
              <BackgroundCredit
                imageUrl={backgroundImage}
                onRefresh={handleRefreshBackground}
                isRefreshing={isRefreshingBackground}
              />
            )}

            {/* Loading indicator - shown while image loads */}
            {!imageLoaded && (
              <div className="fixed inset-0 z-40 flex items-center justify-center pointer-events-none">
                <div className="flex flex-col items-center gap-4">
                  <div className="p-5 rounded-2xl bg-white/10 backdrop-blur-md shadow-2xl animate-float">
                    <Coffee className="w-14 h-14 text-white/90" />
                  </div>
                  <div className="flex items-center gap-1 text-white/70 text-sm font-medium">
                    <span>Brewing your view</span>
                    <span className="animate-bounce-dots">.</span>
                    <span className="animate-bounce-dots animation-delay-200">.</span>
                    <span className="animate-bounce-dots animation-delay-400">.</span>
                  </div>
                </div>
              </div>
            )}
          </>
        )}

        {/* Hide content while settings load or glass theme background loads */}
        <div
          className={`flex h-full w-full relative transition-opacity duration-500 ${
            hideContent ? 'opacity-0' : 'opacity-100'
          }`}
        >
          {/* Main content area */}
          <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
            {currentPage === 'pomodoro' && <PomodoroPage />}
            {currentPage === 'insights' && <InsightsPage />}
            {currentPage === 'quotes' && <QuoteManagementPage />}
            {currentPage === 'goals' && <GoalsPage />}
            {currentPage === 'concepts' && <ConceptsPage />}
            {currentPage === 'home' && <NewTabPage extraSections={effectiveExtraSections} />}
          </main>

          {/* Live Theme Switcher (pushes content to the left when visible) */}
          <ThemeSwitcher isVisible={settings.showThemeSwitcher} />
        </div>

        {/* Toast notifications */}
        <ToastContainer toasts={toasts} onClose={removeToast} position="top-right" />
        {/* Completion celebrations */}
        <CelebrationOverlay />
      </ErrorBoundary>
    </SyncControllerContext.Provider>
  );
}

export default App;
