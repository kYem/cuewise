import { useEffect, useState } from 'react';
import { NewTabPage } from './components/NewTabPage';
import { PomodoroPage } from './components/PomodoroPage';

function App() {
  const [currentPage, setCurrentPage] = useState<'home' | 'pomodoro'>('home');

  useEffect(() => {
    const handleHashChange = () => {
      const hash = window.location.hash.slice(1);
      setCurrentPage(hash === 'pomodoro' ? 'pomodoro' : 'home');
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

  return <NewTabPage />;
}

export default App;
