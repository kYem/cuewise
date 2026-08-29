const form = document.getElementById('request-form');
const thanks = document.getElementById('thanks');
const errorNote = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

const SEND_TIMEOUT_MS = 15000;

if (form === null || thanks === null || errorNote === null || submitBtn === null) {
  // Without this the page still "works": the form falls back to a native submit, which would
  // put the request and the email address in the URL.
  console.error('Feedback form wiring missing', { form, thanks, errorNote, submitBtn });
} else {
  const params = new URLSearchParams(window.location.search);

  // Registered before the preselect below, so a throw there cannot leave the form submitting
  // natively.
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
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      });
      if (response.ok) {
        form.hidden = true;
        thanks.hidden = false;
      } else {
        errorNote.hidden = false;
        submitBtn.disabled = false;
      }
    } catch {
      errorNote.hidden = false;
      submitBtn.disabled = false;
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
