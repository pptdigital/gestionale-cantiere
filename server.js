const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const DATA_FILE = path.join(DATA_DIR, 'db.json');
const PUBLIC_DIR = path.join(__dirname, 'public');

const emptyDb = () => ({
  cantieri: [],
  dipendenti: [],
  presenze: [],
  materiali: [],
  spese: [],
  seq: 1
});

let db = emptyDb();

function loadData() {
  try {
    if (fs.existsSync(DATA_FILE)) {
      db = Object.assign(emptyDb(), JSON.parse(fs.readFileSync(DATA_FILE, 'utf8')));
    }
  } catch (err) {
    console.error('Errore lettura database:', err.message);
    db = emptyDb();
  }
}

let saveTimer = null;
function saveData() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    fs.mkdir(DATA_DIR, { recursive: true }, (err) => {
      if (err) return console.error('Errore scrittura database:', err.message);
      const tmp = DATA_FILE + '.tmp';
      fs.writeFile(tmp, JSON.stringify(db, null, 2), (err2) => {
        if (err2) return console.error('Errore scrittura database:', err2.message);
        fs.rename(tmp, DATA_FILE, () => {});
      });
    });
  }, 100);
}

function nextId() {
  return db.seq++;
}

function sendJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store'
  });
  res.end(body);
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let chunks = [];
    let size = 0;
    req.on('data', (c) => {
      size += c.length;
      if (size > 2 * 1024 * 1024) {
        reject(new Error('Payload troppo grande'));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on('end', () => {
      if (!chunks.length) return resolve({});
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8')));
      } catch {
        reject(new Error('JSON non valido'));
      }
    });
    req.on('error', reject);
  });
}

const collections = ['cantieri', 'dipendenti', 'presenze', 'materiali', 'spese'];

const requiredFields = {
  cantieri: ['nome', 'cliente'],
  dipendenti: ['nome', 'cognome'],
  presenze: ['dipendenteId', 'cantiereId', 'data', 'ore'],
  materiali: ['cantiereId', 'descrizione', 'costo'],
  spese: ['cantiereId', 'descrizione', 'importo']
};

function validate(collection, data) {
  const missing = (requiredFields[collection] || []).filter((f) => {
    const v = data[f];
    if (v === undefined || v === null || v === '') return true;
    if ((f === 'ore' || f === 'costo' || f === 'importo') && (isNaN(Number(v)) || Number(v) < 0)) return true;
    return false;
  });
  return missing.length ? `Campi obbligatori mancanti o non validi: ${missing.join(', ')}` : null;
}

function computeDashboard() {
  const attivi = db.cantieri.filter((c) => c.stato === 'attivo');
  const now = new Date();
  const meseCorrente = now.toISOString().slice(0, 7);
  const oreMese = db.presenze
    .filter((p) => (p.data || '').startsWith(meseCorrente))
    .reduce((s, p) => s + Number(p.ore || 0), 0);

  const costoManodopera = db.presenze.reduce((s, p) => {
    const d = db.dipendenti.find((x) => String(x.id) === String(p.dipendenteId));
    return s + Number(p.ore || 0) * Number(d && d.tariffaOraria ? d.tariffaOraria : 0);
  }, 0);
  const costoMateriali = db.materiali.reduce((s, m) => s + Number(m.costo || 0), 0);
  const altreSpese = db.spese.reduce((s, e) => s + Number(e.importo || 0), 0);
  const budgetTotale = db.cantieri.reduce((s, c) => s + Number(c.budget || 0), 0);

  const perCantiere = db.cantieri.map((c) => {
    const ore = db.presenze
      .filter((p) => String(p.cantiereId) === String(c.id))
      .reduce((s, p) => s + Number(p.ore || 0), 0);
    const mano = db.presenze
      .filter((p) => String(p.cantiereId) === String(c.id))
      .reduce((s, p) => {
        const d = db.dipendenti.find((x) => String(x.id) === String(p.dipendenteId));
        return s + Number(p.ore || 0) * Number(d && d.tariffaOraria ? d.tariffaOraria : 0);
      }, 0);
    const mat = db.materiali
      .filter((m) => String(m.cantiereId) === String(c.id))
      .reduce((s, m) => s + Number(m.costo || 0), 0);
    const spe = db.spese
      .filter((e) => String(e.cantiereId) === String(c.id))
      .reduce((s, e) => s + Number(e.importo || 0), 0);
    return {
      id: c.id,
      nome: c.nome,
      stato: c.stato,
      budget: Number(c.budget || 0),
      ore,
      costo: mano + mat + spe
    };
  });

  return {
    cantieriAttivi: attivi.length,
    cantieriTotali: db.cantieri.length,
    dipendenti: db.dipendenti.length,
    oreMese: Math.round(oreMese * 100) / 100,
    costoTotale: Math.round((costoManodopera + costoMateriali + altreSpese) * 100) / 100,
    budgetTotale,
    perCantiere
  };
}

const routes = {
  'GET /api/dashboard': () => computeDashboard()
};

function listWithLookup(collection) {
  const rows = db[collection].slice().sort((a, b) => (b.id || 0) - (a.id || 0));
  if (collection === 'presenze') {
    return rows.map((p) => {
      const d = db.dipendenti.find((x) => String(x.id) === String(p.dipendenteId));
      const c = db.cantieri.find((x) => String(x.id) === String(p.cantiereId));
      return {
        ...p,
        dipendenteNome: d ? `${d.nome} ${d.cognome}` : '—',
        cantiereNome: c ? c.nome : '—',
        costo: Math.round(Number(p.ore || 0) * Number(d && d.tariffaOraria ? d.tariffaOraria : 0) * 100) / 100
      };
    });
  }
  if (collection === 'materiali' || collection === 'spese') {
    return rows.map((r) => {
      const c = db.cantieri.find((x) => String(x.id) === String(r.cantiereId));
      return { ...r, cantiereNome: c ? c.nome : '—' };
    });
  }
  return rows;
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean);
  const method = req.method;

  if (method === 'GET' && url.pathname === '/api/dashboard') {
    return sendJson(res, 200, computeDashboard());
  }

  if (parts[0] !== 'api' || !collections.includes(parts[1])) {
    return sendJson(res, 404, { error: 'Endpoint non trovato' });
  }
  const collection = parts[1];
  const id = parts[2] ? Number(parts[2]) : null;

  if (method === 'GET' && !id) {
    return sendJson(res, 200, listWithLookup(collection));
  }

  if (method === 'GET' && id) {
    const row = db[collection].find((r) => r.id === id);
    if (!row) return sendJson(res, 404, { error: 'Elemento non trovato' });
    return sendJson(res, 200, row);
  }

  if (method === 'POST' && !id) {
    let data;
    try {
      data = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const err = validate(collection, data);
    if (err) return sendJson(res, 400, { error: err });
    if (collection === 'presenze') {
      const dipOk = db.dipendenti.some((d) => String(d.id) === String(data.dipendenteId));
      const canOk = db.cantieri.some((c) => String(c.id) === String(data.cantiereId));
      if (!dipOk || !canOk) return sendJson(res, 400, { error: 'Dipendente o cantiere inesistente' });
    }
    const row = { id: nextId(), ...data, createdAt: new Date().toISOString() };
    db[collection].push(row);
    saveData();
    return sendJson(res, 201, row);
  }

  if ((method === 'PUT' || method === 'PATCH') && id) {
    const row = db[collection].find((r) => r.id === id);
    if (!row) return sendJson(res, 404, { error: 'Elemento non trovato' });
    let data;
    try {
      data = await readBody(req);
    } catch (err) {
      return sendJson(res, 400, { error: err.message });
    }
    const merged = { ...row, ...data };
    const err = validate(collection, merged);
    if (err) return sendJson(res, 400, { error: err });
    delete merged.id;
    Object.assign(row, merged);
    saveData();
    return sendJson(res, 200, row);
  }

  if (method === 'DELETE' && id) {
    const idx = db[collection].findIndex((r) => r.id === id);
    if (idx === -1) return sendJson(res, 404, { error: 'Elemento non trovato' });
    db[collection].splice(idx, 1);
    if (collection === 'cantieri') {
      db.presenze = db.presenze.filter((p) => String(p.cantiereId) !== String(id));
      db.materiali = db.materiali.filter((m) => String(m.cantiereId) !== String(id));
      db.spese = db.spese.filter((e) => String(e.cantiereId) !== String(id));
    }
    if (collection === 'dipendenti') {
      db.presenze = db.presenze.filter((p) => String(p.dipendenteId) !== String(id));
    }
    saveData();
    return sendJson(res, 200, { ok: true });
  }

  return sendJson(res, 405, { error: 'Metodo non consentito' });
}

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.ico': 'image/x-icon'
};

function serveStatic(req, res, url) {
  let filePath = path.normalize(path.join(PUBLIC_DIR, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!filePath.startsWith(PUBLIC_DIR)) {
    res.writeHead(403);
    return res.end('Forbidden');
  }
  fs.readFile(filePath, (err, content) => {
    if (err) {
      fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, index) => {
        if (err2) {
          res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
          return res.end('Pagina non trovata');
        }
        res.writeHead(200, { 'Content-Type': mimeTypes['.html'] });
        res.end(index);
      });
      return;
    }
    const ext = path.extname(filePath).toLowerCase();
    res.writeHead(200, { 'Content-Type': mimeTypes[ext] || 'application/octet-stream' });
    res.end(content);
  });
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname.startsWith('/api/')) {
      await handleApi(req, res, url);
    } else {
      serveStatic(req, res, url);
    }
  } catch (err) {
    console.error('Errore server:', err);
    if (!res.headersSent) sendJson(res, 500, { error: 'Errore interno del server' });
  }
});

loadData();
server.listen(PORT, () => {
  console.log(`Gestionale Cantiere avviato su http://localhost:${PORT}`);
});
