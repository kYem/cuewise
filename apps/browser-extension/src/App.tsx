import { ToastContainer } from '@cuewise/ui';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { GoalsPage } from './components/GoalsPage';
import { InsightsPage } from './components/InsightsPage';
import { NewTabPage } from './components/NewTabPage';
import { PomodoroPage } from './components/PomodoroPage';
import { QuoteManagementPage } from './components/QuoteManagementPage';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { useSettingsStore } from './stores/settings-store';
import { useToastStore } from './stores/toast-store';
import { getPreloadedCurrentUrl, preloadImages } from './utils/image-preload-cache';
import { loadImageWithFallback } from './utils/unsplash';

type Page = 'home' | 'pomodoro' | 'insights' | 'quotes' | 'goals';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const { toasts, removeToast } = useToastStore();
  const { settings } = useSettingsStore();
  const [backgroundImage, setBackgroundImage] = useState<string | null>(null);
  const [imageLoaded, setImageLoaded] = useState(false);

  // Show background image only when glass theme is selected
  const showBackgroundImage = settings.colorTheme === 'glass';

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

  // Load background image when glass theme is selected
  useEffect(() => {
    if (!showBackgroundImage) {
      setBackgroundImage(null);
      setImageLoaded(false);
      return;
    }

    // Preload images (current + next) when glass theme is active
    preloadImages(settings.focusModeImageCategory);

    let cancelled = false;

    const loadBackground = async () => {
      // Check if we have a preloaded image from the cache
      const preloadedUrl = getPreloadedCurrentUrl(settings.focusModeImageCategory);
      if (preloadedUrl) {
        setBackgroundImage(preloadedUrl);
        setImageLoaded(true);
        return;
      }

      // Fall back to loading a new image
      try {
        const imageUrl = await loadImageWithFallback(settings.focusModeImageCategory);
        if (!cancelled) {
          setBackgroundImage(imageUrl);
          setImageLoaded(true);
        }
      } catch {
        // Failed to load image
        if (!cancelled) {
          setImageLoaded(true);
        }
      }
    };

    loadBackground();

    return () => {
      cancelled = true;
    };
  }, [showBackgroundImage, settings.focusModeImageCategory]);

  return (
    <ErrorBoundary>
      {/* Skip to main content link - visible on focus for keyboard users */}
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:left-4 focus:z-[100] focus:px-4 focus:py-2 focus:bg-primary-600 focus:text-white focus:rounded-md focus:shadow-lg focus:outline-none focus:ring-2 focus:ring-primary-400 focus:ring-offset-2"
      >
        Skip to main content
      </a>

      {/* Global Background Image - shown with glass theme on all pages */}
      {showBackgroundImage && (
        <div
          className={`fixed inset-0 bg-cover bg-center bg-no-repeat transition-opacity duration-1000 ${
            imageLoaded && backgroundImage ? 'opacity-100' : 'opacity-0'
          }`}
          style={{
            backgroundImage: backgroundImage ? `url(${backgroundImage})` : undefined,
          }}
        />
      )}

      <div className="flex h-full w-full relative">
        {/* Main content area */}
        <main id="main-content" className="flex-1 overflow-auto" tabIndex={-1}>
          {currentPage === 'pomodoro' && <PomodoroPage />}
          {currentPage === 'insights' && <InsightsPage />}
          {currentPage === 'quotes' && <QuoteManagementPage />}
          {currentPage === 'goals' && <GoalsPage />}
          {currentPage === 'home' && <NewTabPage />}
        </main>

        {/* Live Theme Switcher (pushes content to the left when visible) */}
        <ThemeSwitcher isVisible={settings.showThemeSwitcher} />
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} position="top-right" />
    </ErrorBoundary>
  );
}

export default App;
