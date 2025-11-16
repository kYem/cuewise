import { Plus } from 'lucide-react';
import type React from 'react';
import { useState } from 'react';
import { useGoalStore } from '../stores/goal-store';

export const GoalInput: React.FC = () => {
  const [text, setText] = useState('');
  const addGoal = useGoalStore((state) => state.addGoal);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (text.trim()) {
      await addGoal(text);
      setText('');
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (text.trim()) {
        addGoal(text);
        setText('');
      }
    }
  };

  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <input
        type="text"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={handleKeyDown}
        placeholder="What do you want to focus on today?"
        className="flex-1 px-4 py-3 rounded-lg border-2 border-border focus:border-primary-500 focus:outline-none transition-colors text-primary placeholder:text-secondary"
        maxLength={200}
      />
      <button
        type="submit"
        disabled={!text.trim()}
        className="px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all flex items-center gap-2 font-medium shadow-sm hover:shadow-md"
      >
        <Plus className="w-5 h-5" />
        <span>Add</span>
      </button>
    </form>
  );
};
