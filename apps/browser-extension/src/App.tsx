import { ToastContainer } from '@cuewise/ui';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InsightsPage } from './components/InsightsPage';
import { NewTabPage } from './components/NewTabPage';
import { PomodoroPage } from './components/PomodoroPage';
import { QuoteManagementPage } from './components/QuoteManagementPage';
import { ThemeSwitcher } from './components/ThemeSwitcher';
import { useSettingsStore } from './stores/settings-store';
import { useToastStore } from './stores/toast-store';

type Page = 'home' | 'pomodoro' | 'insights' | 'quotes';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const { toasts, removeToast } = useToastStore();
  const { settings } = useSettingsStore();

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'pomodoro') {
        setCurrentPage('pomodoro');
      } else if (hash === 'insights') {
        setCurrentPage('insights');
      } else if (hash === 'quotes') {
        setCurrentPage('quotes');
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

  return (
    <ErrorBoundary>
      <div className="flex h-full w-full">
        {/* Main content area */}
        <div className="flex-1 overflow-auto">
          {currentPage === 'pomodoro' && <PomodoroPage />}
          {currentPage === 'insights' && <InsightsPage />}
          {currentPage === 'quotes' && <QuoteManagementPage />}
          {currentPage === 'home' && <NewTabPage />}
        </div>

        {/* Live Theme Switcher (pushes content to the left when visible) */}
        <ThemeSwitcher isVisible={settings.showThemeSwitcher} />
      </div>

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} position="top-right" />
    </ErrorBoundary>
  );
}

export default App;
