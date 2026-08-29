const form = document.getElementById('request-form');
const thanks = document.getElementById('thanks');
const errorNote = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

const SEND_TIMEOUT_MS = 15000;

if (form === null || thanks === null || errorNote === null || submitBtn === null) {
  console.error('Feedback form wiring missing', { form, thanks, errorNote, submitBtn });
} else {
  const params = new URLSearchParams(window.location.search);
  // Cloned nodes, not innerHTML: the default carries the support mailto link, and restoring it
  // must not re-parse markup.
  const defaultErrorNodes = Array.from(errorNote.childNodes).map((node) => node.cloneNode(true));

  const showError = (message, allowRetry = true) => {
    if (message === undefined) {
      errorNote.replaceChildren(...defaultErrorNodes.map((node) => node.cloneNode(true)));
    } else {
      errorNote.textContent = message;
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
        ...(typeof AbortSignal.timeout === 'function'
          ? { signal: AbortSignal.timeout(SEND_TIMEOUT_MS) }
          : {}),
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
        showError('Still sending — check with us before you send this again.', false);
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
