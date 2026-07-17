const form = document.getElementById('uninstall-form');
const thanks = document.getElementById('thanks');
const errorNote = document.getElementById('form-error');
const submitBtn = document.getElementById('submit-btn');

if (form !== null && thanks !== null && errorNote !== null && submitBtn !== null) {
  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    submitBtn.disabled = true;
    errorNote.hidden = true;

    const data = new FormData(form);
    const version = new URLSearchParams(window.location.search).get('v');
    const body = {
      reason: data.get('reason'),
      details: data.get('details') || undefined,
      website: data.get('website') || undefined,
      version: version || undefined,
    };

    try {
      const response = await fetch('/api/feedback/uninstall', {
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
