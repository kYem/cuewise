import { logger } from '@cuewise/shared';
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
import { isUnsplashUrl, preloadImage } from './utils/unsplash';

/** Show the app over the gradient fallback rather than wait on a decorative photo. */
const BACKGROUND_REVEAL_DEADLINE_MS = 1500;
/** Bounds one image load; the gradient is a fine outcome, so don't wait the 10s default. */
const BACKGROUND_LOAD_TIMEOUT_MS = 5000;

type Page = 'home' | 'pomodoro' | 'insights' | 'quotes' | 'goals' | 'concepts';

/** Pages built around the photo. Opt-in, so a page added later dims it and hides its chrome. */
const PHOTO_FORWARD_PAGES: ReadonlySet<Page> = new Set(['home', 'pomodoro']);

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
  const photoIsFeatured = PHOTO_FORWARD_PAGES.has(currentPage);

  // Glass gates content on its background; bounded by BACKGROUND_REVEAL_DEADLINE_MS so it can't stick.
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

  // Anchored to mount, not to the load below: that effect waits on the custom-background
  // read first, so arming the timer there would stack this deadline behind it.
  // Deliberately does not cancel the load — a late photo still fades in behind the app.
  useEffect(() => {
    if (!showBackgroundImage) {
      return;
    }
    const revealTimer = setTimeout(() => setImageLoaded(true), BACKGROUND_REVEAL_DEADLINE_MS);
    return () => clearTimeout(revealTimer);
  }, [showBackgroundImage]);

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

    let cancelled = false;

    const loadBackground = async () => {
      // Unbounded from here: its own retries can stack to ~32s, which is what the
      // reveal deadline above exists to survive.
      await preloadImages(settings.focusModeImageCategory);

      if (cancelled) {
        return;
      }

      // preloadImages has already spent the retry budget; re-running the fallback here
      // would stack another ~24s onto a failure that is usually a blocked CDN.
      const imageUrl = getPreloadedCurrentUrl(settings.focusModeImageCategory);
      if (!imageUrl) {
        setImageLoaded(true);
        return;
      }

      // Load fully before swapping in, so the fade-in never shows a half-painted image.
      try {
        await preloadImage(imageUrl, BACKGROUND_LOAD_TIMEOUT_MS);
        if (!cancelled) {
          setBackgroundImage(imageUrl);
        }
      } catch (error) {
        // Decorative, so no toast — but warn, since a custom image reaches here unvalidated.
        // Never log a custom background: it's a data URL of the user's own picture.
        logger.warn('Background image failed to load; keeping the gradient', {
          error,
          source: isUnsplashUrl(imageUrl) ? imageUrl : 'custom-background',
        });
      }
      if (!cancelled) {
        setImageLoaded(true);
      }
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
              data-testid="background-photo"
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

            {/* Dims the photo so the page's own content stays readable over it. */}
            {!photoIsFeatured && (
              <div className="fixed inset-0 bg-black/25" data-testid="background-dim" />
            )}

            {/* Credit and its refresh sit in the bottom-left, where content pages need the room. */}
            {imageLoaded && photoIsFeatured && (
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
          data-testid="app-content"
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
