// Reveal-on-scroll with a safety net so content is never permanently hidden.
const els = document.querySelectorAll('.reveal');
const revealAll = () => {
  for (const el of els) {
    el.classList.add('in');
  }
};
if (!('IntersectionObserver' in window) || matchMedia('(prefers-reduced-motion: reduce)').matches) {
  revealAll();
} else {
  const io = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (entry.isIntersecting) {
          entry.target.classList.add('in');
          io.unobserve(entry.target);
        }
      }
    },
    { threshold: 0.12, rootMargin: '0px 0px -8% 0px' }
  );
  for (const el of els) {
    io.observe(el);
  }
  setTimeout(revealAll, 2600);
}
