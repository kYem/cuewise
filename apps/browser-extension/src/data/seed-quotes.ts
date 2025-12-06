import type { Quote, QuoteCategory } from '@cuewise/shared';

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

const RESILIENCE_QUOTES = [
  {
    text: 'The greatest glory in living lies not in never falling, but in rising every time we fall.',
    author: 'Nelson Mandela',
  },
  {
    text: 'We may encounter many defeats but we must not be defeated.',
    author: 'Maya Angelou',
  },
  {
    text: "I have not failed. I've just found 10,000 ways that won't work.",
    author: 'Thomas Edison',
  },
  {
    text: "And once the storm is over, you won't remember how you made it through. But one thing is certain. When you come out of the storm, you won't be the same person who walked in.",
    author: 'Haruki Murakami',
  },
  {
    text: 'Rock bottom became the solid foundation on which I rebuilt my life.',
    author: 'J.K. Rowling',
  },
  {
    text: 'The oak fought the wind and was broken, the willow bent when it must and survived.',
    author: 'Robert Jordan',
  },
  {
    text: 'Only those who dare to fail greatly can ever achieve greatly.',
    author: 'Robert F. Kennedy',
  },
  {
    text: 'Persistence and resilience only come from having been given the chance to work through difficult problems.',
    author: 'Gever Tulley',
  },
  {
    text: 'You may have to fight a battle more than once to win it.',
    author: 'Margaret Thatcher',
  },
  {
    text: "The human capacity for burden is like bamboo - far more flexible than you'd ever believe at first glance.",
    author: 'Jodi Picoult',
  },
];

const LEADERSHIP_QUOTES = [
  {
    text: 'A leader is one who knows the way, goes the way, and shows the way.',
    author: 'John C. Maxwell',
  },
  {
    text: 'Before you are a leader, success is all about growing yourself. When you become a leader, success is all about growing others.',
    author: 'Jack Welch',
  },
  {
    text: 'A leader is best when people barely know he exists. When his work is done, his aim fulfilled, they will say: we did it ourselves.',
    author: 'Lao Tzu',
  },
  {
    text: 'Innovation distinguishes between a leader and a follower.',
    author: 'Steve Jobs',
  },
  {
    text: 'Leadership and learning are indispensable to each other.',
    author: 'John F. Kennedy',
  },
  {
    text: 'The task of leadership is not to put greatness into people, but to elicit it, for the greatness is there already.',
    author: 'John Buchan',
  },
  {
    text: 'The greatest leader is not necessarily one who does the greatest things, but one who gets people to do the greatest things.',
    author: 'Ronald Reagan',
  },
  {
    text: 'Leadership is not about being in charge. It is about taking care of those in your charge.',
    author: 'Simon Sinek',
  },
  {
    text: 'Management is doing things right; leadership is doing the right things.',
    author: 'Peter Drucker',
  },
  {
    text: 'The quality of a leader is reflected in the standards they set for themselves.',
    author: 'Ray Kroc',
  },
];

const HEALTH_QUOTES = [
  {
    text: 'It is health that is real wealth and not pieces of gold and silver.',
    author: 'Mahatma Gandhi',
  },
  {
    text: "Take care of your body. It's the only place you have to live.",
    author: 'Jim Rohn',
  },
  {
    text: 'The greatest wealth is health.',
    author: 'Virgil',
  },
  {
    text: 'He who has health has hope, and he who has hope has everything.',
    author: 'Arabian Proverb',
  },
  {
    text: 'Happiness is the highest form of health.',
    author: 'Dalai Lama',
  },
  {
    text: 'A healthy outside starts from the inside.',
    author: 'Robert Urich',
  },
  {
    text: 'Health is not valued till sickness comes.',
    author: 'Thomas Fuller',
  },
  {
    text: 'Physical fitness is the first requisite of happiness.',
    author: 'Joseph Pilates',
  },
  {
    text: 'The first wealth is health.',
    author: 'Ralph Waldo Emerson',
  },
  {
    text: 'To keep the body in good health is a duty, otherwise we shall not be able to keep our mind strong and clear.',
    author: 'Buddha',
  },
];

const GROWTH_QUOTES = [
  {
    text: 'There is nothing noble in being superior to your fellow man; true nobility is being superior to your former self.',
    author: 'Ernest Hemingway',
  },
  {
    text: 'When we are no longer able to change a situation, we are challenged to change ourselves.',
    author: 'Viktor Frankl',
  },
  {
    text: 'The only impossible journey is the one you never begin.',
    author: 'Tony Robbins',
  },
  {
    text: "If you always do what you've always done, you'll always get what you've always got.",
    author: 'Henry Ford',
  },
  {
    text: 'Be not afraid of growing slowly, be afraid only of standing still.',
    author: 'Chinese Proverb',
  },
  {
    text: 'A comfort zone is a beautiful place, but nothing ever grows there.',
    author: 'John Assaraf',
  },
  {
    text: "Growth is painful. Change is painful. But nothing is as painful as staying stuck somewhere you don't belong.",
    author: 'Mandy Hale',
  },
  {
    text: 'The mind, once stretched by a new idea, never returns to its original dimensions.',
    author: 'Ralph Waldo Emerson',
  },
  {
    text: 'Absorb what is useful, discard what is not, add what is uniquely your own.',
    author: 'Bruce Lee',
  },
  {
    text: 'Life begins at the end of your comfort zone.',
    author: 'Neale Donald Walsch',
  },
];

// Map category to quotes - all 10 categories now have unique quotes
const categoryQuotesMap: Record<QuoteCategory, typeof INSPIRATION_QUOTES> = {
  inspiration: INSPIRATION_QUOTES,
  productivity: PRODUCTIVITY_QUOTES,
  learning: LEARNING_QUOTES,
  mindfulness: MINDFULNESS_QUOTES,
  success: SUCCESS_QUOTES,
  creativity: CREATIVITY_QUOTES,
  resilience: RESILIENCE_QUOTES,
  leadership: LEADERSHIP_QUOTES,
  health: HEALTH_QUOTES,
  growth: GROWTH_QUOTES,
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
