// Owner dashboard: sign in with an emailed link, then see and manage every booking.
// Access is enforced by the database (only emails in the admins table can read or change anything).
const $ = (id) => document.getElementById(id);
const esc = (v) => String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
const STATUSES = { reserved: 'Reserved', paid: 'Paid', waitlist: 'Waiting list', interested: 'Interested', cancelled: 'Cancelled' };
const ACTIVE = ['reserved', 'paid'];

const msg = (text, isError = false) => {
  const el = $('admin-msg');
  el.textContent = text;
  el.classList.toggle('is-error', isError);
  el.hidden = !text;
};

if (!BOOKINGS_ON) {
  msg('Bookings are not connected yet: add the Supabase URL and key to js/main.js.', true);
  throw new Error('Supabase not configured');
}

const db = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
let programmes = [];
let signups = [];

const fmtDate = (d) => new Date(d).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtDateTime = (d) => new Date(d).toLocaleString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' });
const progName = (id) => (programmes.find((p) => p.id === id) || { name: id }).name;
const waLink = (n) => `https://wa.me/${n.replace(/\D/g, '').replace(/^0/, '94')}`;
const toLocalInput = (d) => (d ? new Date(new Date(d).getTime() - new Date(d).getTimezoneOffset() * 60000).toISOString().slice(0, 16) : '');

// ---------- Sign in ----------
$('login-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const email = $('login-email').value.trim();
  const { error } = await db.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: false, emailRedirectTo: location.origin + location.pathname },
  });
  msg(error ? `Couldn't send the link: ${error.message}` : `Check ${email} for your sign-in link.`, Boolean(error));
});

$('sign-out').addEventListener('click', async () => {
  await db.auth.signOut();
  location.reload();
});

async function start() {
  const { data: { session } } = await db.auth.getSession();
  if (!session) {
    $('login').hidden = false;
    return;
  }
  $('admin-email').textContent = session.user.email;
  $('admin-user').hidden = false;
  const { data: isAdmin } = await db.rpc('is_admin');
  if (!isAdmin) {
    msg(`${session.user.email} doesn't have access to this page.`, true);
    return;
  }
  $('dashboard').hidden = false;
  await load();
  setInterval(() => { if (!document.hidden) load(); }, 30000);
}

async function load() {
  const [p, s] = await Promise.all([
    db.from('programmes').select('*').order('sort'),
    db.from('signups').select('*').order('created_at', { ascending: false }),
  ]);
  if (p.error || s.error) return msg(`Couldn't load data: ${(p.error || s.error).message}`, true);
  programmes = p.data;
  signups = s.data;
  renderOverview();
  renderProgrammes();
  renderFilters();
  renderList();
}

// ---------- Overview: at a glance, needs attention, coming up ----------
function renderOverview() {
  const now = Date.now();
  const week = now - 7 * 864e5;
  const current = (s) => {
    const p = programmes.find((x) => x.id === s.programme_id);
    return p && s.batch === p.batch;
  };
  const newThisWeek = signups.filter((s) => new Date(s.created_at) > week && s.status !== 'cancelled').length;
  const toSchedule = signups.filter((s) => s.programme_id === 'coaching' && ACTIVE.includes(s.status) && !s.session_at);
  const unpaid = signups.filter((s) => s.status === 'reserved' && s.programme_id !== 'coaching' && current(s));
  const waiting = signups.filter((s) => s.status === 'waitlist' && current(s));

  const seatCards = programmes.filter((p) => p.capacity).map((p) => {
    const taken = signups.filter((s) => s.programme_id === p.id && s.batch === p.batch && ACTIVE.includes(s.status)).length;
    const paid = signups.filter((s) => s.programme_id === p.id && s.batch === p.batch && s.status === 'paid').length;
    return `<div class="stat"><span>${esc(p.name)} · ${esc(p.batch)}</span><b>${taken} / ${p.capacity}</b><small>${paid} paid · ${p.capacity - taken > 0 ? `${p.capacity - taken} seats left` : 'full'}</small></div>`;
  });

  $('stats').innerHTML = [
    ...seatCards,
    `<div class="stat"><span>New sign-ups</span><b>${newThisWeek}</b><small>in the last 7 days</small></div>`,
    `<div class="stat"><span>Coaching to schedule</span><b>${toSchedule.length}</b><small>requests without a date</small></div>`,
    `<div class="stat"><span>Waiting list</span><b>${waiting.length}</b><small>current batches</small></div>`,
  ].join('');

  const attention = [
    ...toSchedule.map((s) => `<li><b>Schedule coaching:</b> ${esc(s.name)} · ${esc((s.note || '').split(' · ')[0])}${s.preferred_time ? ` · prefers ${esc(s.preferred_time)}` : ''} <a href="${waLink(s.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a></li>`),
    ...unpaid.map((s) => `<li><b>Payment pending:</b> ${esc(s.name)} · ${esc(progName(s.programme_id))} (reserved ${fmtDate(s.created_at)}) <a href="${waLink(s.whatsapp)}" target="_blank" rel="noopener">WhatsApp</a></li>`),
  ];
  $('attention').innerHTML = attention.length ? attention.join('') : '<li class="none">Nothing waiting. You\'re all caught up.</li>';

  const upcoming = [
    ...programmes.filter((p) => p.start_date && new Date(p.start_date) >= new Date(new Date().toDateString()))
      .map((p) => ({ at: new Date(p.start_date), html: `<b>${esc(p.name)}</b> ${esc(p.batch)} starts${p.schedule ? ` · ${esc(p.schedule)}` : ''}` })),
    ...signups.filter((s) => s.session_at && new Date(s.session_at) > now - 2 * 3600e3 && ACTIVE.includes(s.status))
      .map((s) => ({ at: new Date(s.session_at), time: true, html: `<b>Coaching</b> with ${esc(s.name)} · ${esc((s.note || '').split(' · ')[0])}` })),
  ].sort((a, b) => a.at - b.at);
  $('upcoming').innerHTML = upcoming.length
    ? upcoming.map((u) => `<li><time>${u.time ? fmtDateTime(u.at) : fmtDate(u.at)}</time><span>${u.html}</span></li>`).join('')
    : '<li class="none">Nothing scheduled yet. Add a start date to a programme, or a date to a coaching booking.</li>';
}

// ---------- Programme settings ----------
function renderProgrammes() {
  $('programmes').innerHTML = programmes.map((p) => {
    const inBatch = signups.filter((s) => s.programme_id === p.id && s.batch === p.batch);
    const taken = inBatch.filter((s) => ACTIVE.includes(s.status)).length;
    return `<form class="admin-card" data-id="${esc(p.id)}">
      <h2>${esc(p.name)}</h2>
      <p class="count"><b>${taken}</b>${p.capacity ? ` of ${p.capacity} seats taken` : ' booked'} · ${inBatch.filter((s) => s.status === 'interested').length} interested</p>
      <div class="row">
        <label>Batch<input name="batch" value="${esc(p.batch)}" required></label>
        <label>Seats<input name="capacity" type="number" min="1" value="${p.capacity ?? ''}" placeholder="No limit"></label>
      </div>
      <div class="row">
        <label>Start date<input name="start_date" type="date" value="${p.start_date ?? ''}"></label>
        <label>Schedule<input name="schedule" value="${esc(p.schedule ?? '')}" placeholder="e.g. Sat 7–9pm"></label>
      </div>
      <label class="check"><input name="open" type="checkbox" ${p.open ? 'checked' : ''}> Taking bookings</label>
      <button class="btn btn--navy" type="submit">Save</button>
    </form>`;
  }).join('');
  $('programmes').querySelectorAll('form').forEach((f) => f.addEventListener('submit', async (e) => {
    e.preventDefault();
    const d = new FormData(f);
    const { error } = await db.from('programmes').update({
      batch: d.get('batch').trim(),
      capacity: d.get('capacity') ? Number(d.get('capacity')) : null,
      start_date: d.get('start_date') || null,
      schedule: d.get('schedule').trim() || null,
      open: d.get('open') === 'on',
    }).eq('id', f.dataset.id);
    msg(error ? `Couldn't save: ${error.message}` : 'Saved. The website updates within a few seconds.', Boolean(error));
    load();
  }));
}

// ---------- Sign-up list ----------
function renderFilters() {
  const sel = $('filter-programme');
  const keep = sel.value;
  sel.innerHTML = '<option value="">All programmes</option>' + programmes.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
  sel.value = keep;
  const batchSel = $('filter-batch');
  const keepBatch = batchSel.value;
  const batches = [...new Set(signups.filter((s) => !sel.value || s.programme_id === sel.value).map((s) => s.batch).filter(Boolean))];
  batchSel.innerHTML = '<option value="">All batches</option>' + batches.map((b) => `<option>${esc(b)}</option>`).join('');
  batchSel.value = batches.includes(keepBatch) ? keepBatch : '';
  $('add-programme').innerHTML = programmes.map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('');
}

const filtered = () => signups.filter((s) =>
  (!$('filter-programme').value || s.programme_id === $('filter-programme').value)
  && (!$('filter-batch').value || s.batch === $('filter-batch').value)
  && (!$('filter-status').value || s.status === $('filter-status').value));

function renderList() {
  const rows = filtered();
  $('list-summary').textContent = `${rows.length} ${rows.length === 1 ? 'person' : 'people'}`;
  $('signup-rows').innerHTML = rows.length ? rows.map((s) => `<tr data-id="${s.id}">
      <td>${fmtDate(s.created_at)}</td>
      <td><b>${esc(s.name)}</b>${s.note ? `<br><small>${esc(s.note)}</small>` : ''}${s.preferred_time ? `<br><small>Prefers: ${esc(s.preferred_time)}</small>` : ''}</td>
      <td><a href="${waLink(s.whatsapp)}" target="_blank" rel="noopener">${esc(s.whatsapp)}</a></td>
      <td>${s.email ? `<a href="mailto:${esc(s.email)}">${esc(s.email)}</a>` : ''}</td>
      <td>${esc(progName(s.programme_id))}<br><small>${esc(s.batch || '')}</small></td>
      <td>${s.programme_id === 'coaching' ? `<input type="datetime-local" data-field="session_at" value="${toLocalInput(s.session_at)}" aria-label="Session date and time">` : ''}</td>
      <td><select data-field="status" class="status-${s.status}">${Object.entries(STATUSES).map(([v, l]) => `<option value="${v}" ${v === s.status ? 'selected' : ''}>${l}</option>`).join('')}</select></td>
      <td><button class="del" type="button" aria-label="Delete ${esc(s.name)}">Delete</button></td>
    </tr>`).join('') : '<tr><td class="empty" colspan="8">No sign-ups yet.</td></tr>';
}

$('signup-rows').addEventListener('change', async (e) => {
  const field = e.target.dataset.field;
  if (!field) return;
  const id = e.target.closest('tr').dataset.id;
  const value = field === 'session_at' ? (e.target.value ? new Date(e.target.value).toISOString() : null) : e.target.value;
  const { error } = await db.from('signups').update({ [field]: value }).eq('id', id);
  msg(error ? `Couldn't save: ${error.message}` : 'Saved.', Boolean(error));
  load();
});

$('signup-rows').addEventListener('click', async (e) => {
  if (!e.target.classList.contains('del')) return;
  const row = e.target.closest('tr');
  if (!confirm(`Delete ${row.querySelector('b').textContent}? This can't be undone. (To free a seat but keep the record, set the status to Cancelled instead.)`)) return;
  const { error } = await db.from('signups').delete().eq('id', row.dataset.id);
  msg(error ? `Couldn't delete: ${error.message}` : 'Deleted.', Boolean(error));
  load();
});

['filter-programme', 'filter-batch', 'filter-status'].forEach((id) => $(id).addEventListener('change', () => { if (id === 'filter-programme') renderFilters(); renderList(); }));

$('download').addEventListener('click', () => {
  const cols = ['created_at', 'name', 'whatsapp', 'email', 'programme_id', 'batch', 'status', 'note', 'preferred_time', 'session_at'];
  const csv = [cols.join(','), ...filtered().map((s) => cols.map((c) => `"${String(s[c] ?? '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const a = Object.assign(document.createElement('a'), { href: URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' })), download: `gurutharuva-signups-${new Date().toISOString().slice(0, 10)}.csv` });
  a.click();
});

$('add-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const p = programmes.find((x) => x.id === $('add-programme').value);
  const { error } = await db.from('signups').insert({
    programme_id: p.id,
    batch: p.batch,
    name: $('add-name').value.trim(),
    whatsapp: $('add-whatsapp').value.trim(),
    email: $('add-email').value.trim() || null,
    status: $('add-status').value,
  });
  msg(error ? `Couldn't add: ${error.message}` : 'Added.', Boolean(error));
  if (!error) e.target.reset();
  load();
});

start();
