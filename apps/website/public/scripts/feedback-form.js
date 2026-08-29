const form = document.getElementById('request-form');
const thanks = document.getElementById('thanks');
const errorNote = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');
const errorReason = document.getElementById('form-error-reason');

const SEND_TIMEOUT_MS = 15000;
// Long enough that a send still in flight lands before a retry could duplicate it.
const RETRY_UNLOCK_MS = 20000;

if (
  form === null ||
  thanks === null ||
  errorNote === null ||
  submitBtn === null ||
  errorReason === null
) {
  console.error('Feedback form wiring missing', {
    form,
    thanks,
    errorNote,
    submitBtn,
    errorReason,
  });
} else {
  const params = new URLSearchParams(window.location.search);
  // Only the reason is swapped. The contact line is a sibling element, so the mailto survives
  // every state without a message having to claim the send failed.
  const defaultReason = errorReason.textContent;

  const showError = (message, allowRetry = true) => {
    errorReason.textContent = message ?? defaultReason;
    errorNote.hidden = false;
    submitBtn.disabled = !allowRetry;
  };

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    errorNote.hidden = true;

    const data = new FormData(form);
    const body = {
      area: data.get('area'),
      details: String(data.get('details') ?? '').trim(),
      email: data.get('email') || undefined,
      trap: data.get('trap') || undefined,
      version: params.get('v') || undefined,
      source: params.get('source') || undefined,
    };

    // Our own flag, not the rejection's name: WebKit aborts an AbortSignal.timeout with
    // AbortError, so reading the name silently skips this branch in Safari.
    const controller = new AbortController();
    let timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
    }, SEND_TIMEOUT_MS);

    try {
      const response = await fetch('/api/feedback/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (response.ok) {
        form.hidden = true;
        thanks.hidden = false;
      } else {
        // The handler distinguishes "you typed nothing" from "we are down"; one static
        // string sends the first case to email support about a form that works.
        const failure = await response.json().catch(() => null);
        showError(
          typeof failure?.error === 'string' && failure.error.length > 0 ? failure.error : undefined
        );
      }
    } catch (error) {
      console.error('Feature request failed to send', error);
      if (timedOut) {
        showError('Still sending — give it a moment before sending again.', false);
        setTimeout(() => {
          submitBtn.disabled = false;
        }, RETRY_UNLOCK_MS);
      } else {
        showError();
      }
    } finally {
      clearTimeout(timer);
    }
  });

  // CSS.escape is load-bearing: the value goes from the URL straight into a selector.
  const presetArea = params.get('area');
  if (presetArea !== null) {
    const preset = form.querySelector(`input[name="area"][value="${CSS.escape(presetArea)}"]`);
    if (preset !== null) {
      preset.checked = true;
    }
  }
}
