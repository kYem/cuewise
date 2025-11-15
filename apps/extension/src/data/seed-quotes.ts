import type { Quote, QuoteCategory } from '@productivity-extension/shared';

/**
 * Seed quotes organized by category
 * Each category has 10 carefully selected quotes
 */

const INSPIRATION_QUOTES = [
  { text: 'The only way to do great work is to love what you do.', author: 'Steve Jobs' },
  { text: "Believe you can and you're halfway there.", author: 'Theodore Roosevelt' },
  { text: "Everything you've ever wanted is on the other side of fear.", author: 'George Addair' },
  { text: 'Dream big and dare to fail.', author: 'Norman Vaughan' },
  {
    text: 'The future belongs to those who believe in the beauty of their dreams.',
    author: 'Eleanor Roosevelt',
  },
  { text: 'It does not matter how slowly you go as long as you do not stop.', author: 'Confucius' },
  { text: 'Act as if what you do makes a difference. It does.', author: 'William James' },
  {
    text: 'Success is not final, failure is not fatal: it is the courage to continue that counts.',
    author: 'Winston Churchill',
  },
  {
    text: 'Never bend your head. Always hold it high. Look the world straight in the eye.',
    author: 'Helen Keller',
  },
  {
    text: 'What you get by achieving your goals is not as important as what you become by achieving your goals.',
    author: 'Zig Ziglar',
  },
];

const PRODUCTIVITY_QUOTES = [
  { text: 'Focus on being productive instead of busy.', author: 'Tim Ferriss' },
  {
    text: "The key is not to prioritize what's on your schedule, but to schedule your priorities.",
    author: 'Stephen Covey',
  },
  { text: 'Until we can manage time, we can manage nothing else.', author: 'Peter Drucker' },
  {
    text: 'Amateurs sit and wait for inspiration, the rest of us just get up and go to work.',
    author: 'Stephen King',
  },
  {
    text: "You don't have to be great to start, but you have to start to be great.",
    author: 'Zig Ziglar',
  },
  { text: 'The way to get started is to quit talking and begin doing.', author: 'Walt Disney' },
  { text: "Don't watch the clock; do what it does. Keep going.", author: 'Sam Levenson' },
  { text: 'Action is the foundational key to all success.', author: 'Pablo Picasso' },
  { text: 'Your mind is for having ideas, not holding them.', author: 'David Allen' },
  { text: 'The secret of getting ahead is getting started.', author: 'Mark Twain' },
];

const LEARNING_QUOTES = [
  {
    text: 'The capacity to learn is a gift; the ability to learn is a skill; the willingness to learn is a choice.',
    author: 'Brian Herbert',
  },
  {
    text: 'Live as if you were to die tomorrow. Learn as if you were to live forever.',
    author: 'Mahatma Gandhi',
  },
  { text: 'In learning you will teach, and in teaching you will learn.', author: 'Phil Collins' },
  {
    text: 'The beautiful thing about learning is that nobody can take it away from you.',
    author: 'B.B. King',
  },
  { text: 'Learning never exhausts the mind.', author: 'Leonardo da Vinci' },
  {
    text: "The more that you read, the more things you will know. The more that you learn, the more places you'll go.",
    author: 'Dr. Seuss',
  },
  {
    text: 'Education is not the filling of a pail, but the lighting of a fire.',
    author: 'W.B. Yeats',
  },
  {
    text: 'Intellectual growth should commence at birth and cease only at death.',
    author: 'Albert Einstein',
  },
  { text: 'An investment in knowledge pays the best interest.', author: 'Benjamin Franklin' },
  { text: 'The expert in anything was once a beginner.', author: 'Helen Hayes' },
];

const MINDFULNESS_QUOTES = [
  {
    text: 'The present moment is the only time over which we have dominion.',
    author: 'Thich Nhat Hanh',
  },
  { text: 'Wherever you are, be all there.', author: 'Jim Elliot' },
  {
    text: 'Mindfulness is a way of befriending ourselves and our experience.',
    author: 'Jon Kabat-Zinn',
  },
  { text: 'The best way to capture moments is to pay attention.', author: 'Jon Kabat-Zinn' },
  {
    text: "In today's rush, we all think too much, seek too much, want too much and forget about the joy of just being.",
    author: 'Eckhart Tolle',
  },
  {
    text: "Be happy in the moment, that's enough. Each moment is all we need, not more.",
    author: 'Mother Teresa',
  },
  {
    text: 'The only way to live is by accepting each minute as an unrepeatable miracle.',
    author: 'Tara Brach',
  },
  { text: 'Silence is not an absence but a presence.', author: 'Anne D. LeClaire' },
  { text: "The little things? The little moments? They aren't little.", author: 'Jon Kabat-Zinn' },
  {
    text: 'Breathe. Let go. And remind yourself that this very moment is the only one you know you have for sure.',
    author: 'Oprah Winfrey',
  },
];

const SUCCESS_QUOTES = [
  {
    text: 'Success is not the key to happiness. Happiness is the key to success.',
    author: 'Albert Schweitzer',
  },
  {
    text: 'Success usually comes to those who are too busy to be looking for it.',
    author: 'Henry David Thoreau',
  },
  {
    text: 'The road to success and the road to failure are almost exactly the same.',
    author: 'Colin R. Davis',
  },
  {
    text: 'Success is walking from failure to failure with no loss of enthusiasm.',
    author: 'Winston Churchill',
  },
  {
    text: "Don't be afraid to give up the good to go for the great.",
    author: 'John D. Rockefeller',
  },
  {
    text: 'I find that the harder I work, the more luck I seem to have.',
    author: 'Thomas Jefferson',
  },
  {
    text: 'Success is not how high you have climbed, but how you make a positive difference to the world.',
    author: 'Roy T. Bennett',
  },
  {
    text: 'The only limit to our realization of tomorrow is our doubts of today.',
    author: 'Franklin D. Roosevelt',
  },
  {
    text: 'Success is liking yourself, liking what you do, and liking how you do it.',
    author: 'Maya Angelou',
  },
  {
    text: 'The secret of success is to do the common thing uncommonly well.',
    author: 'John D. Rockefeller Jr.',
  },
];

const CREATIVITY_QUOTES = [
  { text: 'Creativity is intelligence having fun.', author: 'Albert Einstein' },
  {
    text: 'The desire to create is one of the deepest yearnings of the human soul.',
    author: 'Dieter F. Uchtdorf',
  },
  { text: 'Creativity takes courage.', author: 'Henri Matisse' },
  { text: 'The worst enemy to creativity is self-doubt.', author: 'Sylvia Plath' },
  {
    text: "You can't use up creativity. The more you use, the more you have.",
    author: 'Maya Angelou',
  },
  { text: 'Creativity is contagious, pass it on.', author: 'Albert Einstein' },
  { text: 'The creative adult is the child who survived.', author: 'Ursula K. Le Guin' },
  { text: 'Imagination is the beginning of creation.', author: 'George Bernard Shaw' },
  { text: 'To be creative means to be in love with life.', author: 'Osho' },
  {
    text: 'Every child is an artist. The problem is how to remain an artist once we grow up.',
    author: 'Pablo Picasso',
  },
];

// Map category to quotes
const categoryQuotesMap: Record<QuoteCategory, typeof INSPIRATION_QUOTES> = {
  inspiration: INSPIRATION_QUOTES,
  productivity: PRODUCTIVITY_QUOTES,
  learning: LEARNING_QUOTES,
  mindfulness: MINDFULNESS_QUOTES,
  success: SUCCESS_QUOTES,
  creativity: CREATIVITY_QUOTES,
  // For now, we'll reuse some quotes for the remaining categories
  resilience: INSPIRATION_QUOTES,
  leadership: SUCCESS_QUOTES,
  health: MINDFULNESS_QUOTES,
  growth: LEARNING_QUOTES,
};

/**
 * Generate seed quotes with proper IDs and metadata
 */
export function generateSeedQuotes(): Quote[] {
  const quotes: Quote[] = [];
  let idCounter = 1;

  Object.entries(categoryQuotesMap).forEach(([category, categoryQuotes]) => {
    categoryQuotes.forEach(({ text, author }) => {
      quotes.push({
        id: `seed-${idCounter++}`,
        text,
        author,
        category: category as QuoteCategory,
        isCustom: false,
        isFavorite: false,
        isHidden: false,
        viewCount: 0,
      });
    });
  });

  return quotes;
}

export const SEED_QUOTES = generateSeedQuotes();
