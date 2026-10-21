// Google Apps Script web app URL that saves sign-ups to the Google Sheet.
// Paste the URL from setup/README.md step 6 here.
const INTEREST_ENDPOINT = '';

// Mobile menu toggle
const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
if (header && toggle) {
  toggle.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
  });
}

// Register interest form
const dialog = document.getElementById('interest-dialog');
if (dialog) {
  const form = document.getElementById('interest-form');
  const fields = form.querySelector('.interest-fields');
  const done = document.getElementById('interest-done');
  const error = document.getElementById('interest-error');
  const submit = form.querySelector('button[type="submit"]');

  document.querySelectorAll('[data-interest]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const programme = btn.dataset.interest;
      document.getElementById('interest-programme').value = programme;
      document.getElementById('interest-title').textContent = programme;
      form.reset();
      document.getElementById('interest-programme').value = programme;
      fields.hidden = false;
      done.hidden = true;
      error.hidden = true;
      dialog.showModal();
      document.getElementById('interest-name').focus();
    });
  });

  dialog.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  const showError = (msg) => { error.textContent = msg; error.hidden = false; };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    error.hidden = true;
    const data = new FormData(form);
    const name = (data.get('name') || '').trim();
    const whatsapp = (data.get('whatsapp') || '').trim();
    const email = (data.get('email') || '').trim();

    if (!name) return showError('Please enter your name.');
    if (whatsapp.replace(/\D/g, '').length < 9) return showError('Please enter your WhatsApp number, for example 071 234 5678.');
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return showError('That email address doesn\'t look right. Check it, or leave it empty.');
    if (data.get('website')) return; // spam bot filled the hidden field

    if (!INTEREST_ENDPOINT) return showError('This form isn\'t connected yet. Please message us on WhatsApp: +94 71 550 7060.');

    submit.disabled = true;
    submit.textContent = 'Sending…';
    try {
      await fetch(INTEREST_ENDPOINT, { method: 'POST', mode: 'no-cors', body: new URLSearchParams(data) });
      fields.hidden = true;
      done.hidden = false;
    } catch {
      showError('We couldn\'t send your details. Check your internet connection and try again, or message us on WhatsApp: +94 71 550 7060.');
    } finally {
      submit.disabled = false;
      submit.textContent = 'Register my interest';
    }
  });
}
