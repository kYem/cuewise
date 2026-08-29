const form = document.getElementById('request-form');
const thanks = document.getElementById('thanks');
const errorNote = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

if (form !== null && thanks !== null && errorNote !== null && submitBtn !== null) {
  const params = new URLSearchParams(window.location.search);

  // The app deep-links with ?area= so someone who came from the widget picker lands
  // on the widget question already chosen.
  const presetArea = params.get('area');
  if (presetArea !== null) {
    const preset = form.querySelector(`input[name="area"][value="${CSS.escape(presetArea)}"]`);
    if (preset !== null) {
      preset.checked = true;
    }
  }

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    errorNote.hidden = true;

    const data = new FormData(form);
    const body = {
      area: data.get('area'),
      details: data.get('details'),
      email: data.get('email') || undefined,
      website: data.get('website') || undefined,
      version: params.get('v') || undefined,
      source: params.get('source') || undefined,
    };

    try {
      const response = await fetch('/api/feedback/request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
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
}
