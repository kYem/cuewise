import { useEffect, useState } from 'react';

const MINUTE_MS = 60_000;

/** The current time, re-read as each minute turns over — for displays that never show seconds. */
export function useMinuteNow(): Date {
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout>;
    const schedule = () => {
      const untilNextMinute = MINUTE_MS - (Date.now() % MINUTE_MS);
      timer = setTimeout(() => {
        setNow(new Date());
        schedule();
      }, untilNextMinute);
    };
    // Sleep suspends the timer and its leftover delay runs after wake, so re-read on showing.
    const catchUp = () => {
      clearTimeout(timer);
      setNow(new Date());
      schedule();
    };
    schedule();
    document.addEventListener('visibilitychange', catchUp);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', catchUp);
    };
  }, []);

  return now;
}
