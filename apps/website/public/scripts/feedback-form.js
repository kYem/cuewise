const form = document.getElementById('request-form');
const thanks = document.getElementById('thanks');
const errorNote = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

const SEND_TIMEOUT_MS = 15000;
// How long the button stays down after a timeout: long enough that an in-flight send lands
// first, short enough that nobody is stranded with text they cannot resend.
const RETRY_UNLOCK_MS = 20000;

// AbortSignal.timeout is unavailable in the WebKit the macOS shell runs on older systems, and
// no signal at all means a hung request never settles and the button never comes back.
function timeoutSignal(ms) {
  if (typeof AbortSignal.timeout === 'function') {
    return AbortSignal.timeout(ms);
  }
  const controller = new AbortController();
  setTimeout(() => controller.abort(new DOMException('Timed out', 'TimeoutError')), ms);
  return controller.signal;
}

if (form === null || thanks === null || errorNote === null || submitBtn === null) {
  console.error('Feedback form wiring missing', { form, thanks, errorNote, submitBtn });
} else {
  const params = new URLSearchParams(window.location.search);
  // The default is markup — a support mailto link — so a textContent restore would drop it.
  const defaultErrorNodes = Array.from(errorNote.childNodes).map((node) => node.cloneNode(true));
  const defaultError = () => defaultErrorNodes.map((node) => node.cloneNode(true));

  // Every message keeps the mailto after it: the states that tell someone to reach us are the
  // ones that must still show them how.
  const showError = (message, allowRetry = true) => {
    if (message === undefined) {
      errorNote.replaceChildren(...defaultError());
    } else {
      errorNote.replaceChildren(document.createTextNode(`${message} `), ...defaultError());
    }
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

    try {
      const response = await fetch('/api/feedback/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: timeoutSignal(SEND_TIMEOUT_MS),
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
      if (error?.name === 'TimeoutError') {
        // Held down, not locked: the send may still land, but nobody should be left unable to try.
        showError('Still sending — give it a moment before sending again.', false);
        setTimeout(() => {
          submitBtn.disabled = false;
        }, RETRY_UNLOCK_MS);
      } else {
        showError();
      }
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
