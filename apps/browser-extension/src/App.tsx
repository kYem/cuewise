import { ToastContainer } from '@cuewise/ui';
import { useEffect, useState } from 'react';
import { ErrorBoundary } from './components/ErrorBoundary';
import { InsightsPage } from './components/InsightsPage';
import { NewTabPage } from './components/NewTabPage';
import { PomodoroPage } from './components/PomodoroPage';
import { useToastStore } from './stores/toast-store';

type Page = 'home' | 'pomodoro' | 'insights';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');
  const { toasts, removeToast } = useToastStore();

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      if (hash === 'pomodoro') {
        setCurrentPage('pomodoro');
      } else if (hash === 'insights') {
        setCurrentPage('insights');
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
      {currentPage === 'pomodoro' && <PomodoroPage />}
      {currentPage === 'insights' && <InsightsPage />}
      {currentPage === 'home' && <NewTabPage />}

      {/* Toast notifications */}
      <ToastContainer toasts={toasts} onClose={removeToast} position="top-right" />
    </ErrorBoundary>
  );
}

export default App;
