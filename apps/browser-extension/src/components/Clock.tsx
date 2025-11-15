import { formatClockTime, formatLongDate, getGreeting } from '@cuewise/shared';
import type React from 'react';
import { useEffect, useState } from 'react';

export const Clock: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const { time: formattedTime, period } = formatClockTime(time);
  const greeting = getGreeting(time);
  const dateString = formatLongDate(time);

  return (
    <div className="text-center mb-12 animate-slide-up">
      <div className="text-7xl md:text-8xl font-bold text-gray-800 mb-2 font-display tracking-tight">
        {formattedTime}
        <span className="text-4xl md:text-5xl ml-2 text-gray-500 font-medium">{period}</span>
      </div>
      <div className="text-xl md:text-2xl text-gray-600 mb-1">{greeting}</div>
      <div className="text-base md:text-lg text-gray-500">{dateString}</div>
    </div>
  );
};
