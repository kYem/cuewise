import React, { useState, useEffect } from 'react';

export const Clock: React.FC = () => {
  const [time, setTime] = useState(new Date());

  useEffect(() => {
    const timer = setInterval(() => {
      setTime(new Date());
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  const hours = time.getHours();
  const minutes = time.getMinutes();
  const period = hours >= 12 ? 'PM' : 'AM';
  const displayHours = hours % 12 || 12;

  const formattedTime = `${displayHours.toString().padStart(2, '0')}:${minutes
    .toString()
    .padStart(2, '0')}`;

  // Get greeting based on time of day
  const getGreeting = () => {
    if (hours < 12) return 'Good Morning';
    if (hours < 18) return 'Good Afternoon';
    return 'Good Evening';
  };

  // Get date string
  const dateString = time.toLocaleDateString('en-US', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <div className="text-center mb-12 animate-slide-up">
      <div className="text-7xl md:text-8xl font-bold text-gray-800 mb-2 font-display tracking-tight">
        {formattedTime}
        <span className="text-4xl md:text-5xl ml-2 text-gray-500 font-medium">{period}</span>
      </div>
      <div className="text-xl md:text-2xl text-gray-600 mb-1">{getGreeting()}</div>
      <div className="text-base md:text-lg text-gray-500">{dateString}</div>
    </div>
  );
};
