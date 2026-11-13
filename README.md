# 🏗️ Gestionale Cantiere

Applicazione web per la gestione di cantieri edili: cantieri, dipendenti, presenze, materiali e spese, con dashboard dei costi.

## Funzionalità

- **Dashboard** — cantieri attivi, ore del mese, costi totali, utilizzo budget e top cantieri per costo
- **Cantieri** — anagrafica completa (cliente, indirizzo, periodo, budget, stato) con avanzamento spesa rispetto al budget
- **Dipendenti** — anagrafica personale con ruolo e tariffa oraria
- **Presenze** — ore lavorate per dipendente e cantiere, con costo manodopera calcolato automaticamente
- **Materiali** — acquisti e forniture per cantiere con fornitore e quantità
- **Spese** — spese accessorie categorizzate (noleggio, trasporti, sicurezza…)

## Avvio

```bash
npm start
```

L'app è raggiungibile su [http://localhost:3000](http://localhost:3000). Porta personalizzabile con `PORT=8080 npm start`.

Non richiede dipendenze esterne: basta Node.js ≥ 18.

## Dati

I dati vengono salvati in `data/db.json` (creato automaticamente al primo avvio). Per ripartire da zero è sufficiente eliminare il file o la cartella `data/`.

## API REST

Tutte le risorse supportano le operazioni standard:

```
GET    /api/cantieri
POST   /api/cantieri
PUT    /api/cantieri/:id
DELETE /api/cantieri/:id
```

Stesso schema per `dipendenti`, `presenze`, `materiali` e `spese`. In più:

```
GET /api/dashboard   # aggregati e costi per cantiere
```

## Struttura

```
server.js        # server HTTP, API REST e persistenza JSON
public/
  index.html     # shell dell'app
  style.css      # stili
  app.js         # logica frontend (SPA)
data/db.json     # database (generato a runtime)
```

La cancellazione di un cantiere rimuove anche presenze, materiali e spese collegati; la cancellazione di un dipendente rimuove le sue presenze.
