for (const form of document.querySelectorAll('[data-newsletter-form]')) {
  const msg = form.querySelector('.newsletter-msg');
  const button = form.querySelector('button[type="submit"]');
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    if (msg === null || button === null) {
      return;
    }
    const data = new FormData(form);
    const email = String(data.get('email') ?? '').trim();
    const website = String(data.get('website') ?? '');
    msg.textContent = '';
    msg.className = 'newsletter-msg';
    if (email.length === 0 || !email.includes('@')) {
      msg.textContent = 'Please enter a valid email address.';
      msg.classList.add('err');
      return;
    }
    button.disabled = true;
    button.textContent = 'Subscribing…';
    let succeeded = false;
    try {
      const res = await fetch('/api/newsletter/subscribe', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, website }),
      });
      if (res.ok) {
        succeeded = true;
        msg.textContent = "You're in — welcome to the journey.";
        msg.classList.add('ok');
        button.textContent = 'Subscribed ✓';
        form.reset();
      } else {
        const body = await res.json().catch(() => null);
        msg.textContent = body?.error ?? 'Something went wrong, please try again.';
        msg.classList.add('err');
      }
    } catch {
      msg.textContent = 'Network error — please try again.';
      msg.classList.add('err');
    } finally {
      if (!succeeded) {
        button.disabled = false;
        button.textContent = 'Subscribe';
      }
    }
  });
}
