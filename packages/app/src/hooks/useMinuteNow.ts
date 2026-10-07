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
    schedule();
    return () => clearTimeout(timer);
  }, []);

  return now;
}
