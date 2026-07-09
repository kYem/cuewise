import { useQuoteStore } from '../../stores/quote-store';

/**
 * Quote overlay for focus mode.
 * Shows the current quote with subtle styling.
 */
export function FocusModeQuote() {
  const { currentQuote } = useQuoteStore();

  if (!currentQuote) {
    return null;
  }

  return (
    <div className="absolute bottom-44 left-0 right-0 px-8 md:px-16">
      <blockquote className="max-w-3xl mx-auto text-center">
        <p className="text-white/80 text-lg md:text-xl italic leading-relaxed drop-shadow-lg">
          "{currentQuote.text}"
        </p>
        <footer className="mt-2 text-white/60 text-sm">— {currentQuote.author}</footer>
      </blockquote>
    </div>
  );
}
