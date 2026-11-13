const state = {
  view: 'dashboard',
  cache: {},
  filtri: { presenze: '', materiali: '', spese: '', cantieri: '' }
};

const euro = (n) => new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR' }).format(Number(n) || 0);
const num = (n) => new Intl.NumberFormat('it-IT', { maximumFractionDigits: 2 }).format(Number(n) || 0);
const dataIt = (s) => {
  if (!s) return '—';
  const d = new Date(s);
  return isNaN(d) ? s : d.toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' });
};

async function api(path, options = {}) {
  const res = await fetch(path, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || 'Errore del server');
  return body;
}

function toast(msg, isError = false) {
  const el = document.createElement('div');
  el.className = 'toast' + (isError ? ' error' : '');
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2800);
}

function escapeHtml(v) {
  return String(v ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

async function loadAll() {
  const [cantieri, dipendenti, presenze, materiali, spese, dashboard] = await Promise.all([
    api('/api/cantieri'), api('/api/dipendenti'), api('/api/presenze'),
    api('/api/materiali'), api('/api/spese'), api('/api/dashboard')
  ]);
  state.cache = { cantieri, dipendenti, presenze, materiali, spese, dashboard };
}

const views = {
  dashboard: renderDashboard,
  cantieri: renderCantieri,
  dipendenti: renderDipendenti,
  presenze: renderPresenze,
  materiali: renderMateriali,
  spese: renderSpese
};

function render() {
  views[state.view]();
  document.querySelectorAll('.nav-btn').forEach((b) => {
    b.classList.toggle('active', b.dataset.view === state.view);
  });
}

async function refresh() {
  try {
    await loadAll();
    render();
  } catch (err) {
    toast(err.message, true);
  }
}

function header(title, sub, btnHtml = '') {
  return `<div class="page-header"><div><h1>${title}</h1><p>${sub}</p></div>${btnHtml}</div>`;
}

const STATI = ['pianificato', 'attivo', 'sospeso', 'completato'];
const badgeStato = (s) => `<span class="badge badge-${escapeHtml(s)}">${escapeHtml(s)}</span>`;

function renderDashboard() {
  const d = state.cache.dashboard;
  const top = d.perCantiere.slice().sort((a, b) => b.costo - a.costo).slice(0, 5);
  const main = document.getElementById('main');
  main.innerHTML = `
    ${header('Dashboard', 'Panoramica generale dei cantieri')}
    <div class="cards">
      <div class="card"><div class="label">Cantieri attivi</div><div class="value">${d.cantieriAttivi}</div><div class="sub">su ${d.cantieriTotali} totali</div></div>
      <div class="card"><div class="label">Ore lavorate (mese)</div><div class="value">${num(d.oreMese)}</div><div class="sub">h registrate questo mese</div></div>
      <div class="card"><div class="label">Costo totale</div><div class="value">${euro(d.costoTotale)}</div><div class="sub">manodopera + materiali + spese</div></div>
      <div class="card"><div class="label">Budget totale</div><div class="value">${euro(d.budgetTotale)}</div><div class="sub">${d.budgetTotale > 0 ? 'utilizzo ' + Math.round((d.costoTotale / d.budgetTotale) * 100) + '%' : 'nessun budget impostato'}</div></div>
      <div class="card"><div class="label">Dipendenti</div><div class="value">${d.dipendenti}</div><div class="sub">in anagrafica</div></div>
    </div>
    <div class="panel">
      <div class="panel-title">Costi per cantiere (top 5)</div>
      ${top.length ? `<table>
        <thead><tr><th>Cantiere</th><th>Stato</th><th>Budget</th><th>Ore</th><th>Costo</th><th>Avanzamento budget</th></tr></thead>
        <tbody>${top.map((c) => {
          const pct = c.budget > 0 ? Math.min(100, Math.round((c.costo / c.budget) * 100)) : 0;
          const color = c.budget > 0 && c.costo > c.budget ? 'var(--red)' : 'var(--primary)';
          return `<tr>
            <td><strong>${escapeHtml(c.nome)}</strong></td>
            <td>${badgeStato(c.stato)}</td>
            <td>${euro(c.budget)}</td>
            <td>${num(c.ore)} h</td>
            <td>${euro(c.costo)}</td>
            <td><div class="progress"><div class="progress-bar" style="width:${pct}%;background:${color}"></div></div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty">Nessun dato disponibile. Crea il primo cantiere per iniziare.</div>'}
    </div>`;
}

function renderCantieri() {
  const filtro = (state.filtri.cantieri || '').toLowerCase();
  const rows = state.cache.cantieri.filter((c) =>
    !filtro || (c.nome || '').toLowerCase().includes(filtro) || (c.cliente || '').toLowerCase().includes(filtro)
  );
  document.getElementById('main').innerHTML = `
    ${header('Cantieri', 'Gestione dei cantieri e del loro stato',
      '<button class="btn btn-primary" onclick="openCantiereForm()">+ Nuovo cantiere</button>')}
    <div class="filters">
      <input type="text" placeholder="Cerca per nome o cliente…" value="${escapeHtml(state.filtri.cantieri || '')}"
        oninput="state.filtri.cantieri=this.value;renderCantieri()">
    </div>
    <div class="panel">
      ${rows.length ? `<table>
        <thead><tr><th>Nome</th><th>Cliente</th><th>Indirizzo</th><th>Periodo</th><th>Budget</th><th>Stato</th><th>Avanzamento</th><th></th></tr></thead>
        <tbody>${rows.map((c) => {
          const dash = state.cache.dashboard.perCantiere.find((x) => x.id === c.id) || { costo: 0, ore: 0 };
          const pct = c.budget > 0 ? Math.round((dash.costo / c.budget) * 100) : 0;
          return `<tr>
            <td><strong>${escapeHtml(c.nome)}</strong></td>
            <td>${escapeHtml(c.cliente)}</td>
            <td>${escapeHtml(c.indirizzo || '—')}</td>
            <td>${dataIt(c.dataInizio)} → ${dataIt(c.dataFine)}</td>
            <td>${euro(c.budget)}</td>
            <td>${badgeStato(c.stato)}</td>
            <td><div style="display:flex;align-items:center;gap:8px"><div class="progress"><div class="progress-bar" style="width:${Math.min(100, pct)}%;background:${c.budget > 0 && dash.costo > c.budget ? 'var(--red)' : 'var(--primary)'}"></div></div><span style="font-size:12px;color:var(--muted)">${pct}%</span></div></td>
            <td><div class="actions">
              <button class="btn btn-secondary btn-sm" onclick="openCantiereForm(${c.id})">Modifica</button>
              <button class="btn btn-danger btn-sm" onclick="elimina('cantieri',${c.id})">Elimina</button>
            </div></td>
          </tr>`;
        }).join('')}</tbody>
      </table>` : '<div class="empty">Nessun cantiere trovato.</div>'}
    </div>`;
}

function renderDipendenti() {
  const rows = state.cache.dipendenti;
  document.getElementById('main').innerHTML = `
    ${header('Dipendenti', 'Anagrafica del personale e tariffe orarie',
      '<button class="btn btn-primary" onclick="openDipendenteForm()">+ Nuovo dipendente</button>')}
    <div class="panel">
      ${rows.length ? `<table>
        <thead><tr><th>Nome</th><th>Ruolo</th><th>Telefono</th><th>Email</th><th>Tariffa oraria</th><th></th></tr></thead>
        <tbody>${rows.map((d) => `<tr>
          <td><strong>${escapeHtml(d.nome)} ${escapeHtml(d.cognome)}</strong></td>
          <td>${escapeHtml(d.ruolo || '—')}</td>
          <td>${escapeHtml(d.telefono || '—')}</td>
          <td>${escapeHtml(d.email || '—')}</td>
          <td>${d.tariffaOraria ? euro(d.tariffaOraria) + '/h' : '—'}</td>
          <td><div class="actions">
            <button class="btn btn-secondary btn-sm" onclick="openDipendenteForm(${d.id})">Modifica</button>
            <button class="btn btn-danger btn-sm" onclick="elimina('dipendenti',${d.id})">Elimina</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">Nessun dipendente in anagrafica.</div>'}
    </div>`;
}

function filtriCantiere(key) {
  const val = state.filtri[key] || '';
  return `<select onchange="state.filtri['${key}']=this.value;render${key[0].toUpperCase() + key.slice(1)}()">
    <option value="">Tutti i cantieri</option>
    ${state.cache.cantieri.map((c) => `<option value="${c.id}" ${String(c.id) === String(val) ? 'selected' : ''}>${escapeHtml(c.nome)}</option>`).join('')}
  </select>`;
}

function renderPresenze() {
  const filtro = state.filtri.presenze;
  const rows = state.cache.presenze.filter((p) => !filtro || String(p.cantiereId) === String(filtro));
  const totOre = rows.reduce((s, p) => s + Number(p.ore || 0), 0);
  const totCosto = rows.reduce((s, p) => s + Number(p.costo || 0), 0);
  document.getElementById('main').innerHTML = `
    ${header('Presenze', 'Ore lavorate dai dipendenti sui cantieri',
      '<button class="btn btn-primary" onclick="openPresenzaForm()">+ Nuova presenza</button>')}
    <div class="filters">${filtriCantiere('presenze')}</div>
    <div class="cards">
      <div class="card"><div class="label">Ore visualizzate</div><div class="value">${num(totOre)}</div></div>
      <div class="card"><div class="label">Costo manodopera</div><div class="value">${euro(totCosto)}</div></div>
    </div>
    <div class="panel">
      ${rows.length ? `<table>
        <thead><tr><th>Data</th><th>Dipendente</th><th>Cantiere</th><th>Ore</th><th>Descrizione</th><th>Costo</th><th></th></tr></thead>
        <tbody>${rows.map((p) => `<tr>
          <td>${dataIt(p.data)}</td>
          <td><strong>${escapeHtml(p.dipendenteNome)}</strong></td>
          <td>${escapeHtml(p.cantiereNome)}</td>
          <td>${num(p.ore)} h</td>
          <td>${escapeHtml(p.descrizione || '—')}</td>
          <td>${euro(p.costo)}</td>
          <td><div class="actions">
            <button class="btn btn-secondary btn-sm" onclick="openPresenzaForm(${p.id})">Modifica</button>
            <button class="btn btn-danger btn-sm" onclick="elimina('presenze',${p.id})">Elimina</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">Nessuna presenza registrata.</div>'}
    </div>`;
}

function renderMateriali() {
  const filtro = state.filtri.materiali;
  const rows = state.cache.materiali.filter((m) => !filtro || String(m.cantiereId) === String(filtro));
  const tot = rows.reduce((s, m) => s + Number(m.costo || 0), 0);
  document.getElementById('main').innerHTML = `
    ${header('Materiali', 'Acquisti e forniture per cantiere',
      '<button class="btn btn-primary" onclick="openMaterialeForm()">+ Nuovo materiale</button>')}
    <div class="filters">${filtriCantiere('materiali')}</div>
    <div class="cards"><div class="card"><div class="label">Totale materiali</div><div class="value">${euro(tot)}</div></div></div>
    <div class="panel">
      ${rows.length ? `<table>
        <thead><tr><th>Data</th><th>Cantiere</th><th>Descrizione</th><th>Fornitore</th><th>Quantità</th><th>Costo</th><th></th></tr></thead>
        <tbody>${rows.map((m) => `<tr>
          <td>${dataIt(m.data)}</td>
          <td>${escapeHtml(m.cantiereNome)}</td>
          <td><strong>${escapeHtml(m.descrizione)}</strong></td>
          <td>${escapeHtml(m.fornitore || '—')}</td>
          <td>${escapeHtml(m.quantita || '—')}</td>
          <td>${euro(m.costo)}</td>
          <td><div class="actions">
            <button class="btn btn-secondary btn-sm" onclick="openMaterialeForm(${m.id})">Modifica</button>
            <button class="btn btn-danger btn-sm" onclick="elimina('materiali',${m.id})">Elimina</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">Nessun materiale registrato.</div>'}
    </div>`;
}

function renderSpese() {
  const filtro = state.filtri.spese;
  const rows = state.cache.spese.filter((e) => !filtro || String(e.cantiereId) === String(filtro));
  const tot = rows.reduce((s, e) => s + Number(e.importo || 0), 0);
  document.getElementById('main').innerHTML = `
    ${header('Spese', 'Spese accessorie e imprevisti di cantiere',
      '<button class="btn btn-primary" onclick="openSpesaForm()">+ Nuova spesa</button>')}
    <div class="filters">${filtriCantiere('spese')}</div>
    <div class="cards"><div class="card"><div class="label">Totale spese</div><div class="value">${euro(tot)}</div></div></div>
    <div class="panel">
      ${rows.length ? `<table>
        <thead><tr><th>Data</th><th>Cantiere</th><th>Descrizione</th><th>Categoria</th><th>Importo</th><th></th></tr></thead>
        <tbody>${rows.map((e) => `<tr>
          <td>${dataIt(e.data)}</td>
          <td>${escapeHtml(e.cantiereNome)}</td>
          <td><strong>${escapeHtml(e.descrizione)}</strong></td>
          <td>${escapeHtml(e.categoria || '—')}</td>
          <td>${euro(e.importo)}</td>
          <td><div class="actions">
            <button class="btn btn-secondary btn-sm" onclick="openSpesaForm(${e.id})">Modifica</button>
            <button class="btn btn-danger btn-sm" onclick="elimina('spese',${e.id})">Elimina</button>
          </div></td>
        </tr>`).join('')}</tbody>
      </table>` : '<div class="empty">Nessuna spesa registrata.</div>'}
    </div>`;
}

const modalOverlay = document.getElementById('modal-overlay');
const modal = document.getElementById('modal');

function openModal(title, formHtml) {
  modal.innerHTML = `<h2>${title}</h2><form id="modal-form" novalidate>${formHtml}</form>`;
  modalOverlay.classList.remove('hidden');
  const first = modal.querySelector('input, select, textarea');
  if (first) first.focus();
}

function closeModal() {
  modalOverlay.classList.add('hidden');
  modal.innerHTML = '';
}
modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });
document.addEventListener('keydown', (e) => { if (e.key === 'Escape') closeModal(); });

function field(label, name, value, attrs = '', full = false, type = 'text') {
  return `<div class="field ${full ? 'full' : ''}"><label>${label}</label>
    <input type="${type}" name="${name}" value="${escapeHtml(value ?? '')}" ${attrs}></div>`;
}

function selectField(label, name, value, options, full = false) {
  return `<div class="field ${full ? 'full' : ''}"><label>${label}</label>
    <select name="${name}">${options.map((o) =>
      `<option value="${escapeHtml(o.value)}" ${String(o.value) === String(value) ? 'selected' : ''}>${escapeHtml(o.label)}</option>`
    ).join('')}</select></div>`;
}

function formActions(errorId) {
  return `<div class="form-error" id="${errorId}"></div>
    <div class="modal-actions">
      <button type="button" class="btn btn-secondary" onclick="closeModal()">Annulla</button>
      <button type="submit" class="btn btn-primary">Salva</button>
    </div>`;
}

async function submitForm(url, method, errorId) {
  const form = document.getElementById('modal-form');
  const data = Object.fromEntries(new FormData(form).entries());
  try {
    await api(url, { method, body: JSON.stringify(data) });
    closeModal();
    toast('Salvato con successo');
    await refresh();
  } catch (err) {
    const el = document.getElementById(errorId);
    if (el) el.textContent = err.message;
    else toast(err.message, true);
  }
}

function openCantiereForm(id) {
  const c = id ? state.cache.cantieri.find((x) => x.id === id) || {} : {};
  openModal(id ? 'Modifica cantiere' : 'Nuovo cantiere', `
    <div class="form-grid">
      ${field('Nome cantiere *', 'nome', c.nome, 'required', false)}
      ${field('Cliente *', 'cliente', c.cliente, 'required')}
      ${field('Indirizzo', 'indirizzo', c.indirizzo, '', true)}
      ${field('Data inizio', 'dataInizio', c.dataInizio, '', false, 'date')}
      ${field('Data fine prevista', 'dataFine', c.dataFine, '', false, 'date')}
      ${field('Budget (€)', 'budget', c.budget, 'min="0" step="0.01"', false, 'number')}
      ${selectField('Stato', 'stato', c.stato || 'pianificato', STATI.map((s) => ({ value: s, label: s })), true)}
    </div>
    ${formActions('cantieri-error')}`);
  document.getElementById('modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(id ? `/api/cantieri/${id}` : '/api/cantieri', id ? 'PUT' : 'POST', 'cantieri-error');
  });
}

function openDipendenteForm(id) {
  const d = id ? state.cache.dipendenti.find((x) => x.id === id) || {} : {};
  openModal(id ? 'Modifica dipendente' : 'Nuovo dipendente', `
    <div class="form-grid">
      ${field('Nome *', 'nome', d.nome, 'required')}
      ${field('Cognome *', 'cognome', d.cognome, 'required')}
      ${field('Ruolo', 'ruolo', d.ruolo, '', true)}
      ${field('Telefono', 'telefono', d.telefono)}
      ${field('Email', 'email', d.email, 'type="email"')}
      ${field('Tariffa oraria (€/h)', 'tariffaOraria', d.tariffaOraria, 'min="0" step="0.01"', false, 'number')}
    </div>
    ${formActions('dipendenti-error')}`);
  document.getElementById('modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(id ? `/api/dipendenti/${id}` : '/api/dipendenti', id ? 'PUT' : 'POST', 'dipendenti-error');
  });
}

function opzioniDipendenti(sel) {
  return state.cache.dipendenti.map((d) => ({ value: d.id, label: `${d.nome} ${d.cognome}` }));
}

function openPresenzaForm(id) {
  const p = id ? state.cache.presenze.find((x) => x.id === id) || {} : {};
  if (!state.cache.dipendenti.length || !state.cache.cantieri.length) {
    toast('Servono almeno un dipendente e un cantiere registrati', true);
    return;
  }
  openModal(id ? 'Modifica presenza' : 'Nuova presenza', `
    <div class="form-grid">
      ${selectField('Dipendente *', 'dipendenteId', p.dipendenteId, opzioniDipendenti(), true)}
      ${selectField('Cantiere *', 'cantiereId', p.cantiereId, state.cache.cantieri.map((c) => ({ value: c.id, label: c.nome })), true)}
      ${field('Data *', 'data', p.data || new Date().toISOString().slice(0, 10), 'required', false, 'date')}
      ${field('Ore *', 'ore', p.ore ?? 8, 'required min="0" max="24" step="0.25"', false, 'number')}
      ${field('Descrizione attività', 'descrizione', p.descrizione, '', true)}
    </div>
    ${formActions('presenze-error')}`);
  document.getElementById('modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(id ? `/api/presenze/${id}` : '/api/presenze', id ? 'PUT' : 'POST', 'presenze-error');
  });
}

function openMaterialeForm(id) {
  const m = id ? state.cache.materiali.find((x) => x.id === id) || {} : {};
  if (!state.cache.cantieri.length) { toast('Crea prima un cantiere', true); return; }
  openModal(id ? 'Modifica materiale' : 'Nuovo materiale', `
    <div class="form-grid">
      ${selectField('Cantiere *', 'cantiereId', m.cantiereId, state.cache.cantieri.map((c) => ({ value: c.id, label: c.nome })), true)}
      ${field('Descrizione *', 'descrizione', m.descrizione, 'required', true)}
      ${field('Fornitore', 'fornitore', m.fornitore)}
      ${field('Quantità', 'quantita', m.quantita)}
      ${field('Costo (€) *', 'costo', m.costo, 'required min="0" step="0.01"', false, 'number')}
      ${field('Data', 'data', m.data || new Date().toISOString().slice(0, 10), '', false, 'date')}
    </div>
    ${formActions('materiali-error')}`);
  document.getElementById('modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(id ? `/api/materiali/${id}` : '/api/materiali', id ? 'PUT' : 'POST', 'materiali-error');
  });
}

function openSpesaForm(id) {
  const s = id ? state.cache.spese.find((x) => x.id === id) || {} : {};
  if (!state.cache.cantieri.length) { toast('Crea prima un cantiere', true); return; }
  openModal(id ? 'Modifica spesa' : 'Nuova spesa', `
    <div class="form-grid">
      ${selectField('Cantiere *', 'cantiereId', s.cantiereId, state.cache.cantieri.map((c) => ({ value: c.id, label: c.nome })), true)}
      ${field('Descrizione *', 'descrizione', s.descrizione, 'required', true)}
      ${selectField('Categoria', 'categoria', s.categoria || 'Altro',
        ['Noleggio', 'Trasporti', 'Utensili', 'Sicurezza', 'Altro'].map((c) => ({ value: c, label: c })))}
      ${field('Importo (€) *', 'importo', s.importo, 'required min="0" step="0.01"', false, 'number')}
      ${field('Data', 'data', s.data || new Date().toISOString().slice(0, 10), '', false, 'date')}
    </div>
    ${formActions('spese-error')}`);
  document.getElementById('modal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    submitForm(id ? `/api/spese/${id}` : '/api/spese', id ? 'PUT' : 'POST', 'spese-error');
  });
}

async function elimina(collection, id) {
  if (!confirm('Confermi l\'eliminazione? I dati collegati verranno rimossi.')) return;
  try {
    await api(`/api/${collection}/${id}`, { method: 'DELETE' });
    toast('Elemento eliminato');
    await refresh();
  } catch (err) {
    toast(err.message, true);
  }
}

document.getElementById('nav').addEventListener('click', (e) => {
  const btn = e.target.closest('.nav-btn');
  if (!btn) return;
  state.view = btn.dataset.view;
  render();
});

refresh();
