// Supabase project that stores bookings and sign-ups (Project Settings → API).
// The anon key is public by design: the database only lets visitors book a seat and read seat counts.
const SUPABASE_URL = '';
const SUPABASE_ANON_KEY = '';
const BOOKINGS_ON = Boolean(SUPABASE_URL && SUPABASE_ANON_KEY);
const WHATSAPP_HELP = 'Please message us on WhatsApp: +94 71 550 7060.';

const rpc = async (fn, body = {}) => {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      Authorization: `Bearer ${SUPABASE_ANON_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`${fn} failed: ${res.status}`);
  return res.json();
};

// Mobile menu toggle
const header = document.querySelector('.site-header');
const toggle = document.querySelector('.menu-toggle');
if (header && toggle) {
  toggle.addEventListener('click', () => {
    const open = header.classList.toggle('is-open');
    toggle.setAttribute('aria-expanded', open);
  });
}

// Live seat counts: a seat map plus "12 seats left" text, refreshed every 15 seconds
const seatCounts = {};
const slug = (text) => text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const seatsLeft = (p) => (p && p.capacity ? Math.max(p.capacity - p.taken, 0) : null);

function renderSeats() {
  document.querySelectorAll('[data-seats]').forEach((map) => {
    const p = seatCounts[map.dataset.seats];
    if (!p || !p.capacity) return;
    const left = seatsLeft(p);
    let grid = map.querySelector('.seat-grid');
    if (!grid || grid.childElementCount !== p.capacity) {
      map.innerHTML = `<p class="seat-map-label"></p><div class="seat-grid" role="img">${'<span></span>'.repeat(p.capacity)}</div>`;
      grid = map.querySelector('.seat-grid');
    }
    grid.setAttribute('aria-label', `${p.taken} of ${p.capacity} seats taken`);
    [...grid.children].forEach((seat, i) => seat.classList.toggle('is-taken', i < p.taken));
    map.querySelector('.seat-map-label').innerHTML = left
      ? `<strong>${left}</strong> of ${p.capacity} seats left`
      : '<strong>Batch full</strong> · join the waiting list';
    map.hidden = false;
  });

  document.querySelectorAll('[data-seats-text]').forEach((el) => {
    const p = seatCounts[el.dataset.seatsText];
    if (!p || !p.capacity) return;
    const left = seatsLeft(p);
    const text = !p.open || !left ? 'Batch full · waiting list open' : left === 1 ? 'Only 1 seat left' : `${left} of ${p.capacity} seats left`;
    el.textContent = el.classList.contains('seats-note') ? ` · ${text}` : text;
  });

  document.querySelectorAll('[data-enrol]').forEach((btn) => {
    const p = seatCounts[btn.dataset.enrol];
    if (!p || !p.capacity) return;
    if (!btn.dataset.label) btn.dataset.label = btn.textContent;
    btn.textContent = !p.open || !seatsLeft(p) ? 'Join the waiting list' : btn.dataset.label;
  });
}

async function loadSeats() {
  if (!BOOKINGS_ON || !document.querySelector('[data-seats], [data-seats-text]')) return;
  try {
    (await rpc('seat_counts')).forEach((p) => { seatCounts[p.programme_id] = p; });
    renderSeats();
  } catch (err) {
    console.warn(err);
  }
}
loadSeats();
setInterval(() => { if (!document.hidden) loadSeats(); }, 15000);
document.addEventListener('visibilitychange', () => { if (!document.hidden) loadSeats(); });

// Booking and register-interest form
const dialog = document.getElementById('interest-dialog');
if (dialog) {
  const form = document.getElementById('interest-form');
  const fields = form.querySelector('.interest-fields');
  const done = document.getElementById('interest-done');
  const error = document.getElementById('interest-error');
  const submit = document.getElementById('interest-submit');
  const doneLink = document.getElementById('interest-done-link');
  const set = (id, text) => { document.getElementById(id).textContent = text; };
  let current = null;

  const whenWrap = document.getElementById('interest-when-wrap');

  const open = (btn) => {
    const coaching = 'book' in btn.dataset;
    const enrol = coaching || 'enrol' in btn.dataset;
    const id = coaching ? btn.dataset.book : enrol ? btn.dataset.enrol : slug(btn.dataset.interest);
    const p = seatCounts[id];
    const full = enrol && p && p.capacity && (!p.open || !seatsLeft(p));
    current = { id, name: btn.dataset.name || btn.dataset.interest, enrol, coaching, note: btn.dataset.package || null, whatsapp: btn.dataset.whatsapp || '' };

    form.reset();
    whenWrap.hidden = !coaching;
    if (coaching) {
      set('interest-eyebrow', '1-to-1 coaching');
      set('interest-title', current.note.split(' · ')[0]);
      set('interest-lede', `${current.note.split(' · ').slice(1).join(' · ')}. Tell us when suits you and we'll message you on WhatsApp to fix the date and time.`);
      submit.textContent = 'Request my session';
      fields.hidden = false;
      done.hidden = true;
      error.hidden = true;
      dialog.showModal();
      document.getElementById('interest-name').focus();
      return;
    }
    set('interest-eyebrow', full ? 'Waiting list' : enrol ? 'Book your seat' : 'Register interest');
    set('interest-title', current.name);
    set('interest-lede', full
      ? 'This batch is full. Leave your details and we\'ll offer you the first free seat or a place in the next batch.'
      : enrol
        ? `Reserve your seat now${p && p.capacity ? ` (${seatsLeft(p)} of ${p.capacity} left)` : ''}. We'll message you on WhatsApp with the payment details.`
        : 'Leave your details and we\'ll tell you first when the programme opens.');
    submit.textContent = full ? 'Join the waiting list' : enrol ? 'Reserve my seat' : 'Register my interest';
    fields.hidden = false;
    done.hidden = true;
    error.hidden = true;
    dialog.showModal();
    document.getElementById('interest-name').focus();
  };

  document.querySelectorAll('[data-interest], [data-enrol], [data-book]').forEach((btn) => btn.addEventListener('click', () => open(btn)));
  dialog.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => dialog.close()));
  dialog.addEventListener('click', (e) => { if (e.target === dialog) dialog.close(); });

  const showError = (msg) => { error.textContent = msg; error.hidden = false; };

  const showDone = (status) => {
    const texts = {
      reserved: ['Your seat is reserved!', 'We\'ll message you on WhatsApp with the payment details to confirm it. Join the class WhatsApp group now so you don\'t miss anything.'],
      paid: ['You\'re already booked!', 'Your seat is confirmed. See you in class.'],
      waitlist: ['You\'re on the waiting list', 'We\'ll message you on WhatsApp as soon as a seat opens or the next batch starts.'],
      interested: ['Thank you!', 'You\'re on the list. We\'ll message you on WhatsApp when the programme opens.'],
    };
    if (current.coaching) texts.reserved = ['Request received!', 'We\'ll message you on WhatsApp within a day to confirm your session date, time and payment.'];
    const [title, text] = texts[status] || texts.interested;
    set('interest-done-title', title);
    set('interest-done-text', text);
    doneLink.hidden = !(current.whatsapp && !current.coaching && (status === 'reserved' || status === 'paid'));
    doneLink.href = current.whatsapp || '#';
    fields.hidden = true;
    done.hidden = false;
  };

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

    if (!BOOKINGS_ON) return showError(`This form isn't connected yet. ${WHATSAPP_HELP}`);

    submit.disabled = true;
    const label = submit.textContent;
    submit.textContent = 'Sending…';
    try {
      const status = await rpc('sign_up', {
        p_programme: current.id,
        p_name: name,
        p_whatsapp: whatsapp,
        p_email: email || null,
        p_kind: current.enrol ? 'enrol' : 'interest',
        p_note: current.note,
        p_preferred_time: (data.get('when') || '').trim() || null,
      });
      showDone(status);
      loadSeats();
    } catch {
      showError(`We couldn't send your details. Check your internet connection and try again, or ${WHATSAPP_HELP.charAt(0).toLowerCase()}${WHATSAPP_HELP.slice(1)}`);
    } finally {
      submit.disabled = false;
      submit.textContent = label;
    }
  });
}
