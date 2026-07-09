import { formatClockTime, formatLongDate, getGreeting } from '@cuewise/shared';
import type React from 'react';
import { useEffect, useState } from 'react';
import { useSettingsStore } from '../stores/settings-store';

export const Clock: React.FC = () => {
  const [time, setTime] = useState(new Date());
  const timeFormat = useSettingsStore((state) => state.settings.timeFormat);

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const { time: formattedTime, period } = formatClockTime(time, timeFormat);
  const greeting = getGreeting(time);
  const dateString = formatLongDate(time);

  return (
    <div className="text-center mb-12 animate-slide-up">
      <div className="text-7xl md:text-8xl font-bold text-primary mb-2 font-display tracking-tight">
        {formattedTime}
        {period && (
          <span className="text-4xl md:text-5xl ml-2 text-secondary font-medium">{period}</span>
        )}
      </div>
      <div className="text-xl md:text-2xl text-secondary mb-1">{greeting}</div>
      <div className="text-base md:text-lg text-secondary">{dateString}</div>
    </div>
  );
};
