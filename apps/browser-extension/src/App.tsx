import { useEffect, useState } from 'react';
import { InsightsPage } from './components/InsightsPage';
import { NewTabPage } from './components/NewTabPage';
import { PomodoroPage } from './components/PomodoroPage';

type Page = 'home' | 'pomodoro' | 'insights';

function App() {
  const [currentPage, setCurrentPage] = useState<Page>('home');

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

  if (currentPage === 'pomodoro') {
    return <PomodoroPage />;
  }

  if (currentPage === 'insights') {
    return <InsightsPage />;
  }

  return <NewTabPage />;
}

export default App;
