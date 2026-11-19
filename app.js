'use strict';
/* Audit technique Seya – PWA hors ligne. Données : IndexedDB sur l'appareil. */

/* ---------- Outils ---------- */
const $ = s => document.querySelector(s);
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const uid = () => Math.random().toString(36).slice(2, 9) + Date.now().toString(36).slice(-4);
const today = () => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); };
const fdate = d => d ? new Date(d + 'T12:00').toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' }) : '';
const slug = s => String(s || 'audit').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40) || 'audit';
const ls = { get: k => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch { } } };

/* ---------- États (bonhommes) ---------- */
const ST = {
  v: { label: 'Conforme', long: 'Conforme / bon état', color: '#2E9E57' },
  j: { label: 'À surveiller', long: 'À surveiller', color: '#F2B01E' },
  r: { label: 'Défaut', long: 'Défaut / prioritaire', color: '#EB5C37' },
  g: { label: 'Non présent', long: 'Manquant (appareillage important absent)', color: '#D32F2F' },
  a: { label: 'Absent', long: 'Absent du site (non compté)', color: '#9AA29E' }
};
const ORDER = ['v', 'j', 'r', 'g'];          // états comptés dans le bilan
const ALL = ['v', 'j', 'r', 'g', 'a'];       // états proposés à la saisie ('a' = absent, non compté)
function face(s, size = 40) {
  if (s === 'a') return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="16.5" fill="#fff" stroke="#9AA29E" stroke-width="3" stroke-dasharray="4 3"/><path d="M12 20 H28" stroke="#9AA29E" stroke-width="3" stroke-linecap="round"/></svg>`;
  const m = { v: 'M11 25 Q20 35 29 25', j: 'M12 28 H28', r: 'M11 31 Q20 22 29 31', g: 'M12 28 H28' }[s];
  const eyes = s === 'g'
    ? '<path d="M11.5 16 H16.5 M23.5 16 H28.5" stroke="#1b2420" stroke-width="2.6" stroke-linecap="round"/>'
    : '<circle cx="14" cy="16" r="2.5" fill="#1b2420"/><circle cx="26" cy="16" r="2.5" fill="#1b2420"/>';
  return `<svg class="face" width="${size}" height="${size}" viewBox="0 0 40 40" aria-hidden="true"><circle cx="20" cy="20" r="18" fill="${ST[s].color}"/>${eyes}<path d="${m}" fill="none" stroke="#1b2420" stroke-width="2.8" stroke-linecap="round"/></svg>`;
}

/* ---------- Modèle d'audit par défaut (issu de MODELE-Audit-technique.xlsx) ---------- */
// Un libellé commençant par « ~ » est une information à noter (volume, heures…) : pas d'état, hors bilan.
const PRE = ['~Volume', 'Couverture', 'Agitateur', 'Pompe', 'Sonde de niveau'];
const DIG = ['~Volume (dim)', 'Agitateur 1', 'Agitateur 2', 'Agitateur 3', 'Gazomètre', 'Filet + sangles / charpente bois', 'Soupape', 'Réseau de chauffage', 'Sonde de niveau - trop plein - mousse', 'Sonde gaz (mesure niveau gaz)', 'Sonde TT', 'Hublots - état', 'Curage à prévoir ?'];
const STO = ['~Volume', 'Agitateur 1', 'Agitateur 2', 'Agitateur 3', 'Agitateur 4', 'Couverture (gazomètre ou pluie)', 'Filet + sangles / charpente bois', 'Sonde de niveau', 'Sonde gaz', 'Hublots'];
const DEFAULT_TPL = [
  ['Site et entreprises', [['Entreprises', ['Constructeur métha', 'Autre entreprise (GC, MOE, AMO …)']]]],
  ['Intrants et préfosses', [['Silos de stockage', ['Murs', 'Dallage (surface)', 'Stocks']], ['Préfosse 1', PRE], ['Préfosse 2', PRE], ['Préfosse 3', PRE], ['Préfosse 4', PRE]]],
  ['Incorporation', [['Incorporation', ['Trémie / Bol (noter volume trémie)', 'Prémix / broyeur / PF mélange / …']]]],
  ['Digestion', [['Digesteur 1', DIG], ['Digesteur 2', DIG], ['Post-digesteur', DIG.map(x => x === 'Soupape' ? 'Soupape de sécurité' : x)]]],
  ['Gestion des flux', [['Gestion des flux / Local technique', ['Pompe 1', 'Pompe 2', 'Pompe 3', 'Vannes (auto / manuelles)', 'Mesures pression', 'Débitmètre']],
    ['Séparateur de phases', ['Pompe amont', 'Etat général', 'Pompe aval', 'Vannes (auto / manuelles)', 'Mesures pression', 'Débitmètre', 'Plateforme stockage solide (couverture ?)']]]],
  ['Stockage digestat', [['Stockage 1', STO], ['Stockage 2', STO]]],
  ['Gaz et valorisation', [['Pré-épuration', ['Groupe(s) froid(s)', 'Surpresseur', 'Cuve(s) à charbons actifs']],
    ['Local cogénérateur', ['~Nombre d\'heures de fonctionnement', 'Qualité du gaz admis', 'Container ou maçonné', 'Cogé / bloc moteur', 'Cogé / génératrice', 'Analyseur gaz', 'Débitmètre gaz', 'Aérotherme(s)', 'Contrat de maintenance']],
    ['Torchère', ['État général', '~Manuelle / auto', '~Compteur gaz / heure (à noter)']]]],
  ['Chaufferie', [['Chaufferie', ['Chaudière', 'Circuit de chauffage', 'Vase d\'expansion / pression']]]],
  ['Électricité et automate', [['Local électrique', ['TGBT', 'Armoire process', 'Armoire cogé']]]],
  ['Sécurité / ATEX', [['Sécurité / ATEX', ['Zonage ATEX affiché', 'Détecteurs gaz / H2S', 'Arrêts d\'urgence', 'Extincteurs / RIA', 'Registre de sécurité à jour']]]],
  ['Autres équipements', [['Autres équipements / aménagements', ['Valo chaleur (+ quantité)', 'Pont bascule', 'Bâtiment', 'Bureau / sanitaires', 'Lutte incendie', 'Rétention', 'Clôture / portail(s)', 'Voiries', 'Accès au site']]]]
];
const buildTpl = def => def.map(([fam, eqs]) => ({ id: uid(), name: fam, eqs: eqs.map(([n, pts]) => ({ id: uid(), name: n, pts: pts.map(l => l[0] === '~' ? { id: uid(), label: l.slice(1), info: true } : { id: uid(), label: l }) })) }));

/* ---------- Base de données (IndexedDB) ---------- */
let _db;
function openDB() {
  return _db || (_db = new Promise((res, rej) => {
    const r = indexedDB.open('seya-audit', 1);
    r.onupgradeneeded = () => {
      const d = r.result;
      d.createObjectStore('audits', { keyPath: 'id' });
      d.createObjectStore('photos', { keyPath: 'id' }).createIndex('auditId', 'auditId');
      d.createObjectStore('meta', { keyPath: 'k' });
    };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }));
}
function tx(store, mode, fn) {
  return openDB().then(db => new Promise((res, rej) => {
    const t = db.transaction(store, mode); let out;
    const rq = fn(t.objectStore(store)); if (rq) rq.onsuccess = () => out = rq.result;
    t.oncomplete = () => res(out); t.onerror = t.onabort = () => rej(t.error);
  }));
}
const dbGet = (s, k) => tx(s, 'readonly', o => o.get(k));
const dbPut = (s, v) => tx(s, 'readwrite', o => o.put(v));
const dbDel = (s, k) => tx(s, 'readwrite', o => o.delete(k));
const dbAll = s => tx(s, 'readonly', o => o.getAll());
const photosOf = id => tx('photos', 'readonly', o => o.index('auditId').getAll(id));
const getMeta = async k => (await dbGet('meta', k))?.v;
const setMeta = (k, v) => dbPut('meta', { k, v });
async function getTpl() { let t = await getMeta('template'); if (!t) { t = buildTpl(DEFAULT_TPL); await setMeta('template', t); } return t; }

/* ---------- Enregistrement continu ---------- */
let cur = null, saveT = null, indState = 'ok';
function setInd(s) { indState = s; const e = $('#ind'); if (!e) return; e.className = s === 'err' ? 'err' : ''; e.textContent = s === 'ok' ? 'Enregistré ✓' : s === 'wait' ? 'Enregistrement…' : '⚠ Erreur d\'enregistrement'; }
function touch(delay = 150) { if (!cur) return; cur.updatedAt = Date.now(); setInd('wait'); clearTimeout(saveT); saveT = setTimeout(flush, delay); }
async function flush() { clearTimeout(saveT); saveT = null; if (!cur) return; try { await dbPut('audits', cur); setInd('ok'); } catch (e) { setInd('err'); } }
addEventListener('pagehide', flush);
document.addEventListener('visibilitychange', () => { if (document.hidden) flush(); });

/* ---------- Photos ---------- */
async function compress(file, max = 1400, q = 0.72) {
  let bmp;
  try { bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }); }
  catch { bmp = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = URL.createObjectURL(file); }); }
  const w0 = bmp.width || bmp.naturalWidth, h0 = bmp.height || bmp.naturalHeight, k = Math.min(1, max / Math.max(w0, h0));
  const c = document.createElement('canvas'); c.width = Math.round(w0 * k); c.height = Math.round(h0 * k);
  c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
  const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', q));
  return { blob, w: c.width, h: c.height };
}
let urls = [];
const objUrl = b => { const u = URL.createObjectURL(b); urls.push(u); return u; };
const freeUrls = () => { urls.forEach(u => URL.revokeObjectURL(u)); urls = []; };

/* ---------- Statistiques ---------- */
const effState = (a, p) => a.entries[p.id]?.s || 'g';
function stats(a) {
  const tot = { v: 0, j: 0, r: 0, g: 0, a: 0 }, fams = {}, reds = [], yel = [], miss = [];
  for (const eq of a.equips) {
    const R = [], Y = [], G = [];
    for (const p of eq.pts) {
      if (p.info) continue;
      const s = effState(a, p); tot[s]++; if (s === 'a') continue;
      (fams[eq.fam] ||= { v: 0, j: 0, r: 0, g: 0 })[s]++;
      const o = a.entries[p.id]?.o || '';
      if (s === 'r') R.push({ label: p.label, obs: o }); if (s === 'j') Y.push({ label: p.label, obs: o }); if (s === 'g') G.push({ label: p.label, obs: o });
    }
    if (R.length) reds.push({ eq: eq.name, pts: R }); if (Y.length) yel.push({ eq: eq.name, pts: Y }); if (G.length) miss.push({ eq: eq.name, pts: G });
  }
  return { tot, n: tot.v + tot.j + tot.r + tot.g, fams, reds, yel, miss };
}
// Note automatique /20 : conforme = 1, à surveiller = 0,5, défaut = 0,25, non présent = 0 ; les absents ne comptent pas.
const score = S => S.n ? 20 * (S.tot.v + 0.5 * S.tot.j + 0.25 * S.tot.r) / S.n : null;
const fmtScore = x => x == null ? '—' : x.toFixed(1).replace('.', ',');
function progress(a) { let n = 0, d = 0; for (const eq of a.equips) for (const p of eq.pts) { if (p.info) continue; n++; if (a.entries[p.id]?.s) d++; } return { n, d }; }
function eqDone(a, eq) { let n = 0, d = 0; for (const p of eq.pts) { if (p.info) continue; n++; if (a.entries[p.id]?.s) d++; } return { n, d }; }
function touched(a, eq, photoCount) { return photoCount > 0 || eq.pts.some(p => a.entries[p.id]?.s || a.entries[p.id]?.o); }

/* ---------- Mise en page commune ---------- */
function shell(title, back) {
  $('#hdr').innerHTML = (back ? `<a class="bk" href="#${back}" aria-label="Retour">‹</a>` : '<span class="bk0"></span>') + `<div class="ttl">${esc(title)}</div><div id="ind"></div>`;
  setInd(indState);
}
const main = $('#main');
const go = h => { location.hash = h; };

/* ---------- Routage ---------- */
async function route() {
  freeUrls();
  const p = (location.hash.slice(1) || '/').split('/').filter(Boolean);
  if (cur) { await flush(); if (!(p[0] === 'a' && p[1] === cur.id)) cur = null; }
  ls.set('lastRoute', location.hash);
  window.scrollTo(0, 0);
  try {
    if (!p.length) return await vHome();
    if (p[0] === 'new') return vNew();
    if (p[0] === 'a') {
      cur = await dbGet('audits', p[1]); if (!cur) return go('#/');
      if (p[2] === 'e') return await vEquip(p[3]);
      if (p[2] === 'close') return await vClose();
      if (p[2] === 'bilan') return await vBilan();
      return await vAudit();
    }
    if (p[0] === 'archives') return await vArchives();
    if (p[0] === 'settings') return await vSettings();
    if (p[0] === 'backup') return await vBackup();
    go('#/');
  } catch (e) { main.innerHTML = `<div class="warn">Erreur : ${esc(e.message)}</div><a class="btn" href="#/">Accueil</a>`; }
}
addEventListener('hashchange', route);

/* ---------- Événements (délégation) ---------- */
const acts = {};
main.addEventListener('click', e => { const b = e.target.closest('[data-act]'); if (b && acts[b.dataset.act]) { e.preventDefault(); acts[b.dataset.act](b, e); } });
main.addEventListener('input', e => { const t = e.target; if (t.dataset.inp && inps[t.dataset.inp]) inps[t.dataset.inp](t); });
main.addEventListener('change', e => { const t = e.target; if (t.dataset.chg && inps[t.dataset.chg]) inps[t.dataset.chg](t); });
const inps = {};

function modal(html) { closeModal(); const d = document.createElement('div'); d.className = 'modal'; d.id = 'modal'; d.innerHTML = `<div>${html}</div>`; document.body.appendChild(d); d.addEventListener('click', e => { const b = e.target.closest('[data-m]'); if (b && macts[b.dataset.m]) macts[b.dataset.m](b); }); }
const closeModal = () => { $('#modal')?.remove(); };
const macts = { close: closeModal };

/* ---------- Accueil ---------- */
async function vHome() {
  shell('Audit technique Seya');
  const audits = (await dbAll('audits')).sort((a, b) => b.updatedAt - a.updatedAt);
  const run = audits.filter(a => a.status !== 'archive'), arch = audits.filter(a => a.status === 'archive');
  const last = await getMeta('lastBackup');
  const needBk = audits.length && audits.some(a => a.updatedAt > (last || 0)) && (!last || Date.now() - last > 3 * 864e5);
  const ios = /iPhone|iPad/.test(navigator.userAgent), standalone = navigator.standalone || matchMedia('(display-mode: standalone)').matches;
  const prog = a => { const { n, d } = progress(a); return `${d}/${n} points`; };
  main.innerHTML = `
    <img class="logo" src="img/logo.png" alt="Seya">
    <h1>Audit technique</h1><p class="sub">Sites de méthanisation · Seya technique</p>
    ${ios && !standalone && !ls.get('hintInstall') ? `<div class="warn"><b>Installer l'application</b><br>Dans Safari : bouton Partager ⬆︎, puis « Sur l'écran d'accueil ».<br><button class="btn small" data-act="hint">Compris</button></div>` : ''}
    ${needBk ? `<div class="warn"><b>Pense à sauvegarder.</b> Tes audits ne sont que sur cet appareil.<br><a class="btn small main" href="#/backup">Sauvegarder maintenant</a></div>` : ''}
    <a class="btn main" href="#/new">＋ Nouvel audit</a>
    <h2>Audits en cours</h2>
    ${run.length ? run.map(a => `<a class="card" href="#/a/${a.id}"><b>${esc(a.site || 'Sans nom')}</b>${a.client ? ' · ' + esc(a.client) : ''}<div class="m">${fdate(a.date)} · ${a.status === 'cloture' ? 'Clôturé, PDF à exporter' : prog(a)}</div></a>`).join('') : '<p class="sub">Aucun audit en cours.</p>'}
    <hr class="rule">
    <a class="btn" href="#/archives">Archives (${arch.length})</a>
    <a class="btn" href="#/settings">Paramétrage des équipements</a>
    <a class="btn" href="#/backup">Sauvegarde et restauration</a>`;
}
acts.hint = () => { ls.set('hintInstall', '1'); route(); };

/* ---------- Nouvel audit ---------- */
function vNew(src) {
  shell('Nouvel audit', '/');
  main.innerHTML = `
    <h1>Nouvel audit</h1>
    <label class="f">Site *</label><input type="text" id="f_site" autocomplete="off" value="${esc(src?.site || '')}">
    <label class="f">Client</label><input type="text" id="f_client" autocomplete="off" value="${esc(src?.client || '')}">
    <label class="f">Date</label><input type="date" id="f_date" value="${today()}">
    <label class="f">Auditeur</label><input type="text" id="f_aud" autocomplete="off" value="${esc(ls.get('auditeur') || 'Alexandre Zilliox')}">
    <label class="f">Contexte</label><textarea id="f_ctx" placeholder="Motif de la visite, installation, points particuliers…">${esc(src?.contexte || '')}</textarea>
    <button class="btn main" data-act="create">Démarrer l'audit</button>`;
  window._src = src;
}
acts.create = async () => {
  const site = $('#f_site').value.trim(); if (!site) { $('#f_site').focus(); return; }
  const src = window._src;
  const tpl = await getTpl();
  const equips = src ? JSON.parse(JSON.stringify(src.equips)) : tpl.flatMap(f => f.eqs.map(e => ({ id: uid(), fam: f.name, name: e.name, pts: e.pts.map(p => ({ ...p, id: uid() })) })));
  const a = { id: uid(), status: 'encours', site, client: $('#f_client').value.trim(), date: $('#f_date').value || today(), auditeur: $('#f_aud').value.trim(), contexte: $('#f_ctx').value.trim(), equips, entries: {}, general: '', etatProcess: { s: '', o: '' }, etatMoteur: { s: '', o: '' }, createdAt: Date.now(), updatedAt: Date.now() };
  if (src) a.equips.forEach(e => e.pts.forEach(p => p.id = uid()));
  ls.set('auditeur', a.auditeur);
  await dbPut('audits', a); window._src = null; go('#/a/' + a.id);
};

/* ---------- Liste des équipements d'un audit ---------- */
async function vAudit() {
  const a = cur, ro = a.status !== 'encours';
  shell(a.site, '/');
  const photos = await photosOf(a.id), pc = {}; photos.forEach(p => pc[p.eqId] = (pc[p.eqId] || 0) + 1);
  const { n, d } = progress(a), pct = n ? Math.round(100 * d / n) : 0;
  const fams = [...new Set(a.equips.map(e => e.fam))];
  main.innerHTML = `
    <h1>${esc(a.site)}</h1><p class="sub">${esc(a.client)}${a.client ? ' · ' : ''}${fdate(a.date)}${a.auditeur ? ' · ' + esc(a.auditeur) : ''}</p>
    ${a.status === 'archive' ? '<div class="warn">Audit archivé : lecture seule.</div>' : ''}
    ${a.status === 'cloture' ? '<div class="warn">Audit clôturé. <a href="#/a/' + a.id + '/bilan">Voir le bilan</a></div>' : ''}
    <div class="card"><b>Avancement : ${d} / ${n} points saisis</b><div class="bar"><i style="width:${pct}%"></i></div></div>
    ${ro ? `<a class="btn green" href="#/a/${a.id}/bilan">Voir le bilan</a>` : `<a class="btn main" href="#/a/${a.id}/close">Clôturer l'audit</a>`}
    ${fams.map((f, i) => `<details class="fam" ${i < 3 || ls.get('open_' + f) ? 'open' : ''} data-fam="${esc(f)}"><summary>${esc(f)}</summary><div class="eqs">
      ${a.equips.filter(e => e.fam === f).map(e => { const x = eqDone(a, e), t = touched(a, e, pc[e.id] || 0), red = e.pts.some(p => a.entries[p.id]?.s === 'r');
        return `<div class="eq"><a href="#/a/${a.id}/e/${e.id}"><span>${esc(e.name)}</span><span class="bd">${red ? face('r', 22) + ' ' : ''}${pc[e.id] ? '📷' + pc[e.id] + ' ' : ''}${x.n ? (t ? x.d + '/' + x.n : '—') : (t ? '✓' : '—')}</span></a>${ro ? '' : `<button class="dup" data-act="dup" data-id="${e.id}" aria-label="Dupliquer">⧉</button>`}</div>`; }).join('')}
    </div></details>`).join('')}`;
  main.querySelectorAll('details.fam').forEach(el => el.addEventListener('toggle', () => ls.set('open_' + el.dataset.fam, el.open ? '1' : '')));
}
acts.dup = b => {
  const e = cur.equips.find(x => x.id === b.dataset.id);
  modal(`<h2 style="margin-top:0">Dupliquer « ${esc(e.name)} »</h2><p class="sub">Une copie vide (mêmes points de contrôle) est ajoutée à la suite.</p><input type="text" id="dupname" value="${esc(e.name.replace(/\d+$/, '').trim())} ${esc((e.name.match(/\d+$/) || [1])[0] * 1 + 1)}"><button class="btn main" data-m="dupok" data-id="${e.id}">Dupliquer</button><button class="btn" data-m="close">Annuler</button>`);
};
macts.dupok = b => {
  const i = cur.equips.findIndex(x => x.id === b.dataset.id), e = cur.equips[i], name = $('#dupname').value.trim() || e.name + ' (copie)';
  cur.equips.splice(i + 1, 0, { id: uid(), fam: e.fam, name, pts: e.pts.map(p => ({ ...p, id: uid() })) });
  closeModal(); touch(0); flush().then(route);
};

/* ---------- Fiche équipement ---------- */
let curPt = 0, listMode = false;
function pointCard(p, a, ro) {
  const en = a.entries[p.id] || {};
  if (p.info) return `<div class="pt" data-pid="${p.id}"><div class="lab">${esc(p.label)} <span class="tag">· à noter</span></div><textarea ${ro ? 'disabled' : ''} data-inp="obs" data-pid="${p.id}" placeholder="Valeur, remarque… (dictée vocale possible 🎙)">${esc(en.o || '')}</textarea></div>`;
  return `<div class="pt" data-pid="${p.id}"><div class="lab">${esc(p.label)}</div>
    <div class="sts">${ALL.map(s => `<button class="st ${s} ${en.s === s ? 'on' : ''}" ${ro ? 'disabled' : ''} data-act="state" data-pid="${p.id}" data-s="${s}">${face(s, 40)}<span>${ST[s].label}</span></button>`).join('')}</div>
    <textarea ${ro ? 'disabled' : ''} data-inp="obs" data-pid="${p.id}" placeholder="Observation… (dictée vocale possible 🎙)">${esc(en.o || '')}</textarea></div>`;
}
async function vEquip(eid) {
  const a = cur, ro = a.status !== 'encours', i = a.equips.findIndex(e => e.id === eid); if (i < 0) return go('#/a/' + a.id);
  const eq = a.equips[i], photos = (await photosOf(a.id)).filter(p => p.eqId === eid).sort((x, y) => x.ts - y.ts);
  shell(eq.name, '/a/' + a.id);
  curPt = Math.min(curPt, eq.pts.length - 1);
  const mark = p => p.info ? (a.entries[p.id]?.o ? '✓ ' : '· ') : (a.entries[p.id]?.s ? { v: '🟢 ', j: '🟡 ', r: '🔴 ', g: '⚪ ', a: '➖ ' }[a.entries[p.id].s] : '○ ');
  const nextEq = a.equips[i + 1];
  main.innerHTML = `
    <h1>${esc(eq.name)}</h1><p class="sub">${esc(eq.fam)}</p>
    ${ro ? '' : `<label class="btn main" style="cursor:pointer">📷 Photographier l'équipement<input type="file" accept="image/*" capture="environment" id="cam" data-chg="photo" hidden></label>`}
    <div class="photos" id="phs">${photos.map(p => `<div class="ph"><img src="${objUrl(p.blob)}" data-act="zoom" data-id="${p.id}" alt="Photo">${ro ? '' : `<button class="x" data-act="delph" data-id="${p.id}" aria-label="Supprimer">✕</button>`}</div>`).join('')}</div>
    ${ro ? '' : `<label class="ghost" style="cursor:pointer;text-decoration:underline">Ajouter depuis la photothèque<input type="file" accept="image/*" multiple data-chg="photo" hidden></label>`}
    <h3>Points de contrôle</h3>
    ${listMode ? '' : `<select id="sel" data-chg="sel">${eq.pts.map((p, k) => `<option value="${k}" ${k === curPt ? 'selected' : ''}>${mark(p)}${esc(p.label)}</option>`).join('')}</select>`}
    <div id="pts">${listMode ? eq.pts.map(p => pointCard(p, a, ro)).join('') : pointCard(eq.pts[curPt], a, ro)}</div>
    ${listMode ? '' : `<div class="nav2"><button class="btn" data-act="prev" ${curPt === 0 ? 'disabled style="opacity:.4"' : ''}>‹ Précédent</button><button class="btn green" data-act="next" ${curPt >= eq.pts.length - 1 ? 'disabled style="opacity:.4"' : ''}>Suivant ›</button></div>`}
    <button class="btn small" data-act="mode">${listMode ? 'Afficher point par point' : 'Afficher tous les points'}</button>
    ${ro ? '' : `<button class="btn small danger" data-act="absent">➖ Équipement absent du site</button>`}
    <hr class="rule">
    <div class="nav2"><a class="btn" href="#/a/${a.id}">Liste</a>${nextEq ? `<a class="btn main" href="#/a/${a.id}/e/${nextEq.id}">Suivant : ${esc(nextEq.name).slice(0, 18)} ›</a>` : ''}</div>`;
  window._eq = eq;
}
const redraw = () => vEquip(window._eq.id);
acts.mode = () => { listMode = !listMode; redraw(); };
acts.prev = () => { curPt = Math.max(0, curPt - 1); redraw(); };
acts.next = () => { curPt = Math.min(window._eq.pts.length - 1, curPt + 1); redraw(); };
inps.sel = t => { curPt = +t.value; redraw(); };
acts.state = b => {
  const id = b.dataset.pid, s = b.dataset.s, en = cur.entries[id] || (cur.entries[id] = {});
  if (en.s === s) delete en.s; else en.s = s;
  if (!en.s && !en.o) delete cur.entries[id];
  b.closest('.pt').querySelectorAll('.st').forEach(x => x.classList.toggle('on', x.dataset.s === cur.entries[id]?.s));
  touch(0);
};
inps.obs = t => {
  const id = t.dataset.pid, en = cur.entries[id] || (cur.entries[id] = {});
  en.o = t.value; if (!en.o) delete en.o; if (!en.s && !en.o) delete cur.entries[id];
  touch(250);
};
inps.photo = async t => {
  const files = [...t.files]; t.value = '';
  for (const f of files) {
    try { const { blob, w, h } = await compress(f); await dbPut('photos', { id: uid(), auditId: cur.id, eqId: window._eq.id, blob, w, h, ts: Date.now() }); setInd('ok'); }
    catch (e) { setInd('err'); }
  }
  redraw();
};
acts.delph = async b => { if (confirm('Supprimer cette photo ?')) { await dbDel('photos', b.dataset.id); redraw(); } };
acts.zoom = async b => { const p = await dbGet('photos', b.dataset.id); const d = document.createElement('div'); d.className = 'lb'; d.innerHTML = `<img src="${objUrl(p.blob)}"><button>✕</button>`; d.onclick = () => d.remove(); document.body.appendChild(d); };
acts.absent = () => {
  if (!confirm('Marquer tous les points de cet équipement « Absent » ? (non compté dans le bilan)')) return;
  for (const p of window._eq.pts) if (!p.info) cur.entries[p.id] = { ...(cur.entries[p.id] || {}), s: 'a' };
  touch(0); redraw();
};

/* ---------- Clôture : récapitulatif ---------- */
async function vClose() {
  const a = cur; if (a.status !== 'encours') return go('#/a/' + a.id + '/bilan');
  shell('Clôture', '/a/' + a.id);
  const photos = await photosOf(a.id), pc = {}; photos.forEach(p => pc[p.eqId] = (pc[p.eqId] || 0) + 1);
  const untouched = [], partial = [];
  for (const e of a.equips) {
    if (!touched(a, e, pc[e.id] || 0)) { if (e.pts.some(p => !p.info)) untouched.push(e); continue; }
    const miss = e.pts.filter(p => !p.info && !a.entries[p.id]?.s); if (miss.length) partial.push({ e, miss });
  }
  main.innerHTML = `<h1>Récapitulatif avant validation</h1>
    <p class="sub">Équipement non saisi = <b>Absent</b> (non compté). Point non saisi dans un équipement renseigné = <b>Absent</b> aussi (non compté). Corrige ce qui doit l'être, puis valide.</p>
    <h3>${face('a', 22)} Équipements non saisis, considérés absents du site (${untouched.length})</h3>
    ${untouched.length ? untouched.map(e => `<a class="card" href="#/a/${a.id}/e/${e.id}"><b>${esc(e.name)}</b> <span class="m">· ${esc(e.fam)} — ouvrir pour saisir</span></a>`).join('') : '<p class="sub">Aucun.</p>'}
    <h3>Points non saisis dans des équipements renseignés, considérés absents (${partial.reduce((s, x) => s + x.miss.length, 0)})</h3>
    ${partial.length ? partial.map(x => `<a class="card" href="#/a/${a.id}/e/${x.e.id}"><b>${esc(x.e.name)}</b><div class="m">${x.miss.map(p => esc(p.label)).join(' · ')}</div></a>`).join('') : '<p class="sub">Aucun.</p>'}
    <button class="btn main" data-act="valid">Valider la clôture</button>
    <a class="btn" href="#/a/${a.id}">Retour à la saisie</a>`;
}
acts.valid = async () => {
  for (const e of cur.equips) {
    for (const p of e.pts) if (!p.info && !cur.entries[p.id]?.s) cur.entries[p.id] = { ...(cur.entries[p.id] || {}), s: 'a', auto: true }; }
  cur.status = 'cloture'; touch(0); await flush(); go('#/a/' + cur.id + '/bilan');
};
acts.reopen = async () => {
  for (const k of Object.keys(cur.entries)) { const en = cur.entries[k]; if (en.auto) { delete en.s; delete en.auto; if (!en.o) delete cur.entries[k]; } }
  cur.status = 'encours'; touch(0); await flush(); go('#/a/' + cur.id);
};

/* ---------- Bilan ---------- */
function processCard(a, S, ro) {
  const sc = score(S);
  return `<div class="pt"><div class="lab">État général du process <span class="tag">· note automatique</span></div>
    <div class="gauge"><div class="track"></div>${sc == null ? '' : `<div class="mk" style="left:${sc * 5}%"></div>`}</div>
    <div class="gscale"><span>0</span><span>10</span><span>20</span></div>
    <div class="gnote"><b>${fmtScore(sc)}</b> / 20</div>
    <p class="ghost">Calculée à partir des points saisis : conforme = 1, à surveiller = 0,5, défaut = 0,25, non présent = 0 ; les points absents ne comptent pas. Elle ne dépend pas de l'avis de l'auditeur.</p>
    <textarea ${ro ? 'disabled' : ''} data-inp="gobs" data-key="etatProcess" placeholder="Commentaire…">${esc(a.etatProcess.o || '')}</textarea></div>`;
}
function stateRow(key, label, ro) {
  const v = cur[key];
  return `<div class="pt"><div class="lab">${label}</div><div class="sts">${ORDER.map(s => `<button class="st ${s} ${v.s === s ? 'on' : ''}" ${ro ? 'disabled' : ''} data-act="gstate" data-key="${key}" data-s="${s}">${face(s, 34)}<span>${ST[s].label}</span></button>`).join('')}</div>
    <textarea ${ro ? 'disabled' : ''} data-inp="gobs" data-key="${key}" placeholder="Commentaire…">${esc(v.o || '')}</textarea></div>`;
}
acts.gstate = b => { const v = cur[b.dataset.key]; v.s = v.s === b.dataset.s ? '' : b.dataset.s; b.closest('.pt').querySelectorAll('.st').forEach(x => x.classList.toggle('on', x.dataset.s === v.s)); touch(0); };
inps.gobs = t => { cur[t.dataset.key].o = t.value; touch(250); };
inps.general = t => { cur.general = t.value; touch(250); };
async function vBilan() {
  const a = cur, ro = a.status === 'archive'; if (a.status === 'encours') return go('#/a/' + a.id + '/close');
  shell('Bilan', '/a/' + a.id);
  const S = stats(a), pct = k => S.n ? Math.round(100 * S.tot[k] / S.n) : 0;
  const lst = (arr, s) => arr.length ? arr.map(g => `<h3>${face(s, 20)} ${esc(g.eq)}</h3><table><tbody>${g.pts.map(p => `<tr><td style="width:42%"><b>${esc(p.label)}</b></td><td>${esc(p.obs) || '<span class="ghost">—</span>'}</td></tr>`).join('')}</tbody></table>`).join('') : '<p class="sub">Aucun point.</p>';
  main.innerHTML = `<h1>Bilan</h1><p class="sub">Synthèse · ${fdate(a.date)} · ${esc(a.site)}</p>
    <div class="big">${ORDER.map(s => `<div class="k">${face(s, 34)}<div class="n">${S.tot[s]}</div><div class="l">${ST[s].label}</div><div class="p">${pct(s)} %</div></div>`).join('')}</div>
    <div class="stack">${ORDER.map(s => `<i style="flex:${S.tot[s]};background:${ST[s].color}"></i>`).join('')}</div>
    <div class="legend">${ORDER.map(s => `<span><i style="background:${ST[s].color}"></i>${ST[s].label} ${S.tot[s]}</span>`).join('')}</div>
    <div class="stack"><i style="flex:${S.tot.v + S.tot.j};background:repeating-linear-gradient(135deg,#2E9E57 0 7px,#F2B01E 7px 14px)"></i><i style="flex:${S.tot.r + S.tot.g};background:repeating-linear-gradient(135deg,#D32F2F 0 7px,#EB5C37 7px 14px)"></i></div>
    <div class="legend"><span>Conformes + à surveiller : <b>${S.tot.v + S.tot.j}</b> (${pct('v') + pct('j')} %)</span><span>Défauts + non présents : <b>${S.tot.r + S.tot.g}</b> (${pct('r') + pct('g')} %)</span></div>
    ${S.tot.a ? `<p class="ghost">${face('a', 16)} ${S.tot.a} point(s) absent(s) du site : non comptés, sans effet sur la note.</p>` : ''}
    <h2>Répartition par famille</h2>
    <table><thead><tr><th>Famille</th>${ORDER.map(s => `<th class="n">${face(s, 18)}</th>`).join('')}</tr></thead><tbody>${Object.entries(S.fams).map(([f, c]) => `<tr><td>${esc(f)}</td>${ORDER.map(s => `<td class="n">${c[s]}</td>`).join('')}</tr>`).join('')}</tbody></table>
    <h2>${face('r', 24)} Points en défaut (${S.tot.r})</h2>${lst(S.reds, 'r')}
    <h2>${face('j', 24)} Points à surveiller (${S.tot.j})</h2>${lst(S.yel, 'j')}
    <h2>${face('g', 24)} Points non présents (${S.tot.g})</h2>${lst(S.miss, 'g')}
    <h2>Commentaire général</h2>
    ${processCard(a, S, ro)}${stateRow('etatMoteur', 'État général du ou des moteurs', ro)}
    <textarea style="min-height:140px" ${ro ? 'disabled' : ''} data-inp="general" placeholder="Commentaire général libre…">${esc(a.general || '')}</textarea>
    <hr class="rule">
    <button class="btn main" data-act="pdf">${ro ? 'Réexporter le PDF' : 'Générer le PDF'}</button>
    ${ro ? '' : `<button class="btn" data-act="reopen">Revenir à la saisie</button>`}
    <a class="btn" href="#/a/${a.id}">Voir le détail par équipement</a>`;
}

/* ---------- Export PDF ---------- */
acts.pdf = async () => {
  modal('<h2 style="margin-top:0">Génération du PDF…</h2><p class="sub">Quelques secondes.</p>');
  await flush();
  try {
    const blob = await buildPdf(cur), name = `Audit_${slug(cur.site)}_${cur.date}.pdf`;
    window._pdf = { blob, name };
    modal(`<h2 style="margin-top:0">PDF prêt ✓</h2><p class="sub">${esc(name)} · ${(blob.size / 1048576).toFixed(1)} Mo</p><button class="btn main" data-m="share">Enregistrer / partager le PDF</button><button class="btn" data-m="close">Fermer</button>`);
  } catch (e) { modal(`<h2 style="margin-top:0">Erreur</h2><p>${esc(e.message)}</p><button class="btn" data-m="close">Fermer</button>`); }
};
async function deliver(blob, name, type) {
  const file = new File([blob], name, { type });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: name }); return true; } catch (e) { if (e.name === 'AbortError') return false; }
  }
  const u = URL.createObjectURL(blob), l = document.createElement('a'); l.href = u; l.download = name; document.body.appendChild(l); l.click(); l.remove(); setTimeout(() => URL.revokeObjectURL(u), 60000); return true;
}
macts.share = async () => {
  const ok = await deliver(window._pdf.blob, window._pdf.name, 'application/pdf');
  if (cur.status === 'archive') return closeModal();
  if (ok) modal(`<h2 style="margin-top:0">Archiver l'audit ?</h2><p>Si le PDF est bien enregistré, l'audit passe en <b>Archivé</b> : lecture seule, PDF réexportable depuis les Archives.</p><button class="btn main" data-m="archive">Oui, archiver l'audit</button><button class="btn" data-m="share">Enregistrer à nouveau le PDF</button><button class="btn" data-m="close">Pas maintenant</button>`);
};
macts.archive = async () => { cur.status = 'archive'; cur.archivedAt = Date.now(); touch(0); await flush(); closeModal(); go('#/archives'); };

async function loadFont(doc, file, style) {
  const buf = await (await fetch('fonts/' + file)).arrayBuffer(), bytes = new Uint8Array(buf); let bin = '';
  for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode.apply(null, bytes.subarray(i, i + 0x8000));
  doc.addFileToVFS(file, btoa(bin)); doc.addFont(file, 'Mulish', style);
}
const blobURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function buildPdf(a) {
  const { jsPDF } = window.jspdf, doc = new jsPDF({ unit: 'pt', format: 'a4', compress: true });
  await loadFont(doc, 'Mulish-Regular.ttf', 'normal'); await loadFont(doc, 'Mulish-Bold.ttf', 'bold'); await loadFont(doc, 'Mulish-Italic.ttf', 'italic');
  const W = 595.28, H = 841.89, M = 42, CW = W - 2 * M, BOT = H - 56;
  const C = { g: [13, 67, 56], t: [43, 54, 50], s: [95, 107, 103], l: [230, 239, 234], f: [221, 224, 218], o: [235, 92, 55], w: [255, 255, 255] };
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  let y = M;
  const T = (s, x, yy, o = {}) => { doc.setFont('Mulish', o.b ? 'bold' : o.i ? 'italic' : 'normal'); doc.setFontSize(o.z || 9.5); doc.setTextColor(...(o.c || C.t)); doc.text(String(s), x, yy, { align: o.a || 'left', baseline: 'alphabetic' }); };
  const wrap = (s, w, z = 9.5, b) => { doc.setFont('Mulish', b ? 'bold' : 'normal'); doc.setFontSize(z); return doc.splitTextToSize(String(s || ''), w); };
  const fill = (c, x, yy, w, h, r = 0) => { doc.setFillColor(...c); r ? doc.roundedRect(x, yy, w, h, r, r, 'F') : doc.rect(x, yy, w, h, 'F'); };
  const newPage = () => { doc.addPage(); y = M; };
  const ensure = h => { if (y + h > BOT) newPage(); };
  const drawFace = (s, cx, cy, r) => {
    if (s !== 'a') { doc.setFillColor(...hex(ST[s].color)); doc.circle(cx, cy, r, 'F'); } const k = [27, 36, 32];
    doc.setDrawColor(...k); doc.setFillColor(...k); doc.setLineWidth(r * 0.14); doc.setLineCap('round');
    if (s === 'a') { doc.setFillColor(255, 255, 255); doc.circle(cx, cy, r, 'F'); doc.setDrawColor(154, 162, 158); doc.setLineWidth(r * .16); doc.setLineDashPattern([r * .4, r * .3], 0); doc.circle(cx, cy, r * .9, 'S'); doc.setLineDashPattern([], 0); doc.line(cx - r * .45, cy, cx + r * .45, cy); return; }
    if (s === 'g') { doc.line(cx - r * .55, cy - r * .2, cx - r * .2, cy - r * .2); doc.line(cx + r * .2, cy - r * .2, cx + r * .55, cy - r * .2); }
    else { doc.circle(cx - r * .35, cy - r * .2, r * .12, 'F'); doc.circle(cx + r * .35, cy - r * .2, r * .12, 'F'); }
    const pts = []; for (let t = -1; t <= 1.001; t += .25) { const x = cx + t * r * .5; let yy = cy + r * .4;
      if (s === 'v') yy = cy + r * .15 + r * .3 * (1 - t * t); if (s === 'r') yy = cy + r * .55 - r * .3 * (1 - t * t); pts.push([x, yy]); }
    for (let i = 1; i < pts.length; i++) doc.line(pts[i - 1][0], pts[i - 1][1], pts[i][0], pts[i][1]);
  };
  const stripe = (x, yy, w, h, c1, c2) => { if (w <= 0) return; doc.saveGraphicsState(); doc.rect(x, yy, w, h, null); doc.clip(); doc.discardPath(); doc.setFillColor(...c1); doc.rect(x, yy, w, h, 'F'); doc.setDrawColor(...c2); doc.setLineWidth(4.5); for (let i = -h; i < w + h; i += 10) doc.line(x + i, yy + h + 2, x + i + h + 2, yy - 2); doc.restoreGraphicsState(); };
  const title = (num, txt, sub) => { ensure(60); T(num + '. ' + txt, M, y + 16, { b: 1, z: 18, c: C.g }); y += 24; if (sub) { T(sub, M, y + 8, { z: 10, c: C.s }); y += 14; } doc.setDrawColor(...C.f); doc.setLineWidth(.8); doc.line(M, y + 4, M + CW, y + 4); y += 16; };
  const sectionTitle = txt => { ensure(40); T(txt, M, y + 12, { b: 1, z: 12, c: C.g }); y += 22; };
  // Tableau générique : cols = [largeur…], rows = [{cells:[texte | {face,label}], fill, bold, group}]
  const table = (cols, head, rows) => {
    const drawHead = () => { fill(C.g, M, y, CW, 20); let x = M; head.forEach((h, i) => { T(h, x + 6, y + 13.5, { b: 1, c: C.w, z: 9 }); x += cols[i]; }); y += 20; };
    ensure(20 + 34); drawHead(); let alt = 0;
    for (const r of rows) {
      if (r.group) { ensure(20 + 30); fill(C.l, M, y, CW, 19); T(r.group, M + 6, y + 13, { b: 1, c: C.g, z: 9.5 }); y += 19; alt = 0; continue; }
      let h = 0; const L = r.cells.map((c, i) => { if (c && c.face) { h = Math.max(h, 24); return null; } const l = wrap(c, cols[i] - 12, 9.5, r.bold); h = Math.max(h, l.length * 12.5 + 9); return l; });
      if (y + h > BOT) { newPage(); drawHead(); alt = 0; }
      if (alt % 2 === 1) fill(C.l, M, y, CW, h); alt++;
      let x = M; r.cells.forEach((c, i) => { if (c && c.face) { drawFace(c.face, x + 13, y + h / 2, 7); T(c.label, x + 25, y + h / 2 + 3.3, { z: 9, b: 1 }); } else L[i].forEach((ln, k) => T(ln, x + 6, y + 13 + k * 12.5, { b: r.bold })); x += cols[i]; });
      y += h;
    }
    doc.setDrawColor(...C.f); doc.line(M, y, M + CW, y); y += 12;
  };
  const S = stats(a), dateF = fdate(a.date);
  const logoURL = await blobURL(await (await fetch('img/logo.png')).blob());

  /* Page de garde */
  doc.addImage(logoURL, 'PNG', M, 54, 120, 53);
  fill(C.o, M, 170, 54, 5);
  T('Audit technique', M, 222, { b: 1, z: 36, c: C.g });
  T('Site de méthanisation', M, 248, { z: 15, c: C.s });
  wrap(a.site, CW, 22, true).forEach((l, i) => T(l, M, 300 + i * 28, { b: 1, z: 22, c: C.t }));
  T('Synthèse · ' + dateF, M, 300 + wrap(a.site, CW, 22, true).length * 28 + 4, { z: 11, c: C.s });
  const info = [['Site', a.site], ['Client', a.client], ['Date', dateF], ['Auditeur', a.auditeur], ['Contexte', a.contexte]].filter(x => x[1]);
  let ih = 24; const il = info.map(([k, v]) => { const l = wrap(v, CW - 120, 10.5); ih += Math.max(1, l.length) * 14 + 6; return l; });
  const iy = 430; fill(C.l, M, iy, CW, ih, 8); let yy = iy + 24;
  info.forEach(([k], i) => { T(k, M + 18, yy, { b: 1, z: 10.5, c: C.g }); il[i].forEach((l, j) => T(l, M + 110, yy + j * 14, { z: 10.5 })); yy += Math.max(1, il[i].length) * 14 + 6; });
  fill(C.g, 0, H - 70, W, 70); T('Seya Groupe · Seya technique', M, H - 36, { b: 1, z: 11, c: C.w }); T('Rapport d\'audit technique', W - M, H - 36, { z: 10, c: C.w, a: 'right' });

  /* 1. Bilan */
  newPage(); title(1, 'Bilan', 'Synthèse · ' + dateF);
  const bw = (CW - 30) / 4;
  ORDER.forEach((s, i) => { const x = M + i * (bw + 10); fill(C.l, x, y, bw, 92, 8); drawFace(s, x + 22, y + 22, 10);
    T(String(S.tot[s]), x + 12, y + 66, { b: 1, z: 30, c: C.g }); T(ST[s].label, x + 12, y + 80, { b: 1, z: 9 }); T((S.n ? Math.round(100 * S.tot[s] / S.n) : 0) + ' %', x + bw - 10, y + 80, { z: 9, c: C.s, a: 'right' }); });
  y += 108;
  let bx = M; ORDER.forEach(s => { const w = S.n ? CW * S.tot[s] / S.n : 0; if (w > 0) fill(hex(ST[s].color), bx, y, w, 14); bx += w; }); if (!S.n) fill(C.f, M, y, CW, 14); y += 22;
  const w1 = S.n ? CW * (S.tot.v + S.tot.j) / S.n : 0; if (!S.n) fill(C.f, M, y, CW, 14);
  stripe(M, y, w1, 14, hex(ST.v.color), hex(ST.j.color)); stripe(M + w1, y, S.n ? CW - w1 : 0, 14, hex(ST.g.color), hex(ST.r.color)); y += 28;
  const pc = k => S.n ? Math.round(100 * S.tot[k] / S.n) : 0;
  T(`Conformes + à surveiller : ${S.tot.v + S.tot.j} (${pc('v') + pc('j')} %)`, M, y - 6, { z: 9, b: 1, c: C.g }); T(`Défauts + non présents : ${S.tot.r + S.tot.g} (${pc('r') + pc('g')} %)`, M + CW, y - 6, { z: 9, b: 1, c: C.g, a: 'right' }); y += 14;
  if (S.tot.a) { T(`${S.tot.a} point(s) absent(s) du site : non comptés, sans effet sur la note.`, M, y - 4, { i: 1, z: 9, c: C.s }); y += 12; }
  sectionTitle('Répartition par famille');
  table([CW - 4 * 62, 62, 62, 62, 62], ['Famille', 'Conforme', 'À surveiller', 'Défaut', 'Non présent'], Object.entries(S.fams).map(([f, c]) => ({ cells: [f, ...ORDER.map(s => String(c[s]))] })));
  const lstRows = arr => arr.flatMap(g => [{ group: g.eq }, ...g.pts.map(p => ({ cells: [p.label, p.obs || '—'] }))]);
  sectionTitle(`Points en défaut (${S.tot.r})`); S.reds.length ? table([200, CW - 200], ['Point', 'Observation'], lstRows(S.reds)) : (T('Aucun point en défaut.', M, y + 10, { i: 1, c: C.s }), y += 24);
  sectionTitle(`Points à surveiller (${S.tot.j})`); S.yel.length ? table([200, CW - 200], ['Point', 'Observation'], lstRows(S.yel)) : (T('Aucun point à surveiller.', M, y + 10, { i: 1, c: C.s }), y += 24);
  sectionTitle(`Points non présents (${S.tot.g})`); S.miss.length ? table([200, CW - 200], ['Point', 'Observation'], lstRows(S.miss)) : (T('Aucun point non présent.', M, y + 10, { i: 1, c: C.s }), y += 24);

  /* 2. Commentaire général */
  newPage(); title(2, 'Commentaire général');
  { const sc = score(S), l = wrap(a.etatProcess.o || '', CW - 24, 10), h = 78 + l.length * 13; ensure(h + 8);
    fill(C.l, M, y, CW, h, 8); T('État général du process', M + 12, y + 20, { b: 1, c: C.g, z: 10.5 });
    T(sc == null ? '—' : fmtScore(sc) + ' / 20', M + CW - 12, y + 22, { b: 1, z: 15, c: C.g, a: 'right' });
    const gx = M + 12, gw = CW - 24, gy = y + 36, stops = [[211, 47, 47], [235, 92, 55], [242, 176, 30], [46, 158, 87]];
    for (let k = 0; k < 60; k++) { const t = k / 59 * 3, i = Math.min(2, Math.floor(t)), f = t - i; fill(stops[i].map((c, n) => Math.round(c + (stops[i + 1][n] - c) * f)), gx + gw * k / 60, gy, gw / 60 + .6, 9); }
    if (sc != null) { const mx = gx + gw * sc / 20; doc.setFillColor(...C.g); doc.triangle(mx - 5, gy - 7, mx + 5, gy - 7, mx, gy + 1, 'F'); doc.setDrawColor(...C.g); doc.setLineWidth(2); doc.line(mx, gy - 1, mx, gy + 12); }
    T('0', gx, gy + 22, { z: 8, c: C.s }); T('10', gx + gw / 2, gy + 22, { z: 8, c: C.s, a: 'center' }); T('20', gx + gw, gy + 22, { z: 8, c: C.s, a: 'right' });
    T('Note calculée automatiquement : conforme = 1, à surveiller = 0,5, défaut = 0,25, non présent = 0 ; points absents exclus.', M + 12, y + 66, { i: 1, z: 7.5, c: C.s });
    l.forEach((ln, i) => T(ln, M + 12, y + 80 + i * 13, { z: 10 })); y += h + 8; }
  { const v = a.etatMoteur; if (v.s || v.o) { const l = wrap(v.o || '', CW - 24, 10), h = 30 + l.length * 13; ensure(h + 8);
    fill(C.l, M, y, CW, h, 8); T('État général du ou des moteurs', M + 12, y + 18, { b: 1, c: C.g, z: 10.5 }); if (v.s) { drawFace(v.s, M + CW - 100, y + 14, 7); T(ST[v.s].label, M + CW - 88, y + 17.5, { b: 1, z: 9 }); }
    l.forEach((ln, i) => T(ln, M + 12, y + 34 + i * 13, { z: 10 })); y += h + 8; } }
  const gl = wrap(a.general || 'Aucun commentaire général.', CW, 10.5);
  gl.forEach(ln => { ensure(16); T(ln, M, y + 12, { z: 10.5, i: !a.general, c: a.general ? C.t : C.s }); y += 15; });

  /* 3. Détail par équipement */
  newPage(); title(3, 'Détail par équipement', 'Synthèse · ' + dateF);
  const photos = await photosOf(a.id);
  for (const eq of a.equips) {
    const ph = photos.filter(p => p.eqId === eq.id).sort((p, q) => p.ts - q.ts), rated = eq.pts.filter(p => !p.info);
    const allAbs = rated.length > 0 && rated.every(p => effState(a, p) === 'a'), any = !allAbs && ph.length || eq.pts.some(p => { const en = a.entries[p.id]; return en && (en.o || (en.s && !en.auto)); });
    ensure(24 + 34); fill(C.g, M, y, CW, 22); T(eq.name, M + 8, y + 15, { b: 1, z: 11, c: C.w }); T(eq.fam, M + CW - 8, y + 15, { z: 9, c: [200, 220, 212], a: 'right' }); y += 22; if (any || !rated.length) y += 4;
    if (allAbs || (!any && rated.length)) { ensure(30); fill(C.l, M, y, CW, 24); drawFace('a', M + 14, y + 12, 7); T('Absent du site', M + 28, y + 15.5, { z: 9.5, c: C.s }); y += 32; continue; }
    table([170, 100, CW - 270], ['Point de contrôle', 'État', 'Observation'], eq.pts.map(p => p.info
      ? { cells: [p.label, '—', a.entries[p.id]?.o || ''] }
      : { cells: [p.label, { face: effState(a, p), label: ST[effState(a, p)].label }, a.entries[p.id]?.o || ''] }));
    if (ph.length) {
      const gap = 8, cw = (CW - 2 * gap) / 3;
      for (let i = 0; i < ph.length; i += 3) {
        const row = []; for (const p of ph.slice(i, i + 3)) row.push({ url: await blobURL(p.blob), w: p.w, h: p.h });
        const dims = row.map(r => { const k = Math.min(cw / r.w, 135 / r.h); return [r.w * k, r.h * k]; }), rh = Math.max(...dims.map(d => d[1]));
        ensure(rh + 10); row.forEach((r, j) => doc.addImage(r.url, 'JPEG', M + j * (cw + gap), y, dims[j][0], dims[j][1])); y += rh + 8;
      }
      y += 6;
    }
  }
  /* Pieds de page */
  const n = doc.getNumberOfPages();
  for (let i = 2; i <= n; i++) { doc.setPage(i); doc.setDrawColor(...C.f); doc.line(M, H - 40, M + CW, H - 40); T(`Seya technique · Audit technique · ${a.site} · ${dateF}`, M, H - 26, { z: 8, c: C.s }); T(`Page ${i - 1} / ${n - 1}`, M + CW, H - 26, { z: 8, c: C.s, a: 'right' }); }
  return doc.output('blob');
}

/* ---------- Archives ---------- */
async function vArchives() {
  shell('Archives', '/');
  const arch = (await dbAll('audits')).filter(a => a.status === 'archive').sort((a, b) => b.archivedAt - a.archivedAt);
  main.innerHTML = `<h1>Archives</h1><p class="sub">Lecture seule. Le PDF reste réexportable.</p>` + (arch.length ? arch.map(a => `<div class="card"><b>${esc(a.site)}</b>${a.client ? ' · ' + esc(a.client) : ''}<div class="m">${fdate(a.date)}</div>
    <a class="btn small" href="#/a/${a.id}/bilan">Ouvrir le bilan</a><a class="btn small" href="#/a/${a.id}">Détail</a>
    <button class="btn small" data-act="adup" data-id="${a.id}">Dupliquer en nouvel audit</button><button class="btn small danger" data-act="adel" data-id="${a.id}">Supprimer</button></div>`).join('') : '<p class="sub">Aucun audit archivé.</p>');
}
acts.adup = async b => { vNew(await dbGet('audits', b.dataset.id)); };
acts.adel = async b => {
  const a = await dbGet('audits', b.dataset.id);
  if (!confirm(`Supprimer définitivement « ${a.site} » avec ses photos ? Action irréversible.`)) return;
  for (const p of await photosOf(a.id)) await dbDel('photos', p.id); await dbDel('audits', a.id); route();
};

/* ---------- Paramétrage (modèle d'audit) ---------- */
let tpl = null; const openSet = new Set();
const saveTpl = () => setMeta('template', tpl);
async function vSettings() {
  shell('Paramétrage', '/'); tpl = await getTpl();
  const mv = (arr, i, d) => `<button data-act="mv" data-i="${i}" data-d="-1" ${i === 0 ? 'disabled' : ''}>▲</button><button data-act="mv" data-i="${i}" data-d="1" ${i === arr.length - 1 ? 'disabled' : ''}>▼</button>`;
  main.innerHTML = `<h1>Paramétrage</h1><label class="f">Nom de l'auditeur (proposé pour chaque nouvel audit)</label><input type="text" data-inp="aud" value="${esc(ls.get('auditeur') || 'Alexandre Zilliox')}" autocomplete="off">
  <h2>Modèle d'audit</h2><p class="sub">Utilisé pour les <b>nouveaux</b> audits. Les audits déjà créés ne changent pas.</p>
  <div class="ed">${tpl.map((f, fi) => `<details data-key="${f.id}" ${openSet.has(f.id) ? 'open' : ''}><summary>${esc(f.name)}</summary>
    <div class="it"><input type="text" value="${esc(f.name)}" data-chg="rn" data-p="${fi}"><span data-path="${fi}">${mv(tpl, fi).replace(/data-i="\d+"/g, `data-p="${fi}"`)}</span><button data-act="del" data-p="${fi}">✕</button></div>
    ${f.eqs.map((e, ei) => `<details data-key="${e.id}" ${openSet.has(e.id) ? 'open' : ''}><summary>${esc(e.name)}</summary>
      <div class="it"><input type="text" value="${esc(e.name)}" data-chg="rn" data-p="${fi}.${ei}">${mv(f.eqs, ei).replace(/data-i="\d+"/g, `data-p="${fi}.${ei}"`)}<button data-act="del" data-p="${fi}.${ei}">✕</button></div>
      ${e.pts.map((p, pi) => `<div class="it"><input type="text" value="${esc(p.label)}" data-chg="rn" data-p="${fi}.${ei}.${pi}">${mv(e.pts, pi).replace(/data-i="\d+"/g, `data-p="${fi}.${ei}.${pi}"`)}<button data-act="info" data-p="${fi}.${ei}.${pi}" title="Information à noter (sans état)" style="${p.info ? 'background:var(--clair)' : ''}">ℹ︎</button><button data-act="del" data-p="${fi}.${ei}.${pi}">✕</button></div>`).join('')}
      <button class="btn small" data-act="add" data-p="${fi}.${ei}">＋ Point de contrôle</button></details>`).join('')}
    <button class="btn small" data-act="add" data-p="${fi}">＋ Équipement</button></details>`).join('')}
  </div>
  <button class="btn small" data-act="add" data-p="">＋ Famille</button>
  <p class="ghost">ℹ︎ = information à noter (volume, heures…), sans état ni compte dans le bilan.</p>
  <hr class="rule"><button class="btn danger" data-act="resettpl">Réinitialiser au modèle Seya d'origine</button>`;
  main.querySelectorAll('details').forEach(d => d.addEventListener('toggle', () => d.open ? openSet.add(d.dataset.key) : openSet.delete(d.dataset.key)));
}
const getAt = p => { const k = p === '' ? [] : String(p).split('.').map(Number); let arr = tpl, key = ['eqs', 'pts']; for (let d = 0; d < k.length - 1; d++) arr = arr[k[d]][key[d]]; return { arr, i: k[k.length - 1], depth: k.length }; };
inps.aud = t => ls.set('auditeur', t.value.trim());
inps.rn = t => { const { arr, i, depth } = getAt(t.dataset.p); if (depth === 3) arr[i].label = t.value; else arr[i].name = t.value; saveTpl(); };
acts.mv = b => { const { arr, i } = getAt(b.dataset.p), j = i + +b.dataset.d; if (j < 0 || j >= arr.length) return; [arr[i], arr[j]] = [arr[j], arr[i]]; saveTpl().then(vSettings); };
acts.del = b => { const { arr, i, depth } = getAt(b.dataset.p); const nm = arr[i].name || arr[i].label; if (!confirm(`Supprimer « ${nm} » du modèle ?`)) return; arr.splice(i, 1); saveTpl().then(vSettings); };
acts.info = b => { const { arr, i } = getAt(b.dataset.p); arr[i].info = !arr[i].info; saveTpl().then(vSettings); };
acts.add = b => {
  const p = b.dataset.p;
  if (p === '') { const f = { id: uid(), name: 'Nouvelle famille', eqs: [] }; tpl.push(f); openSet.add(f.id); }
  else if (!p.includes('.')) { const e = { id: uid(), name: 'Nouvel équipement', pts: [] }; tpl[+p].eqs.push(e); openSet.add(tpl[+p].id); openSet.add(e.id); }
  else { const [fi, ei] = p.split('.').map(Number); tpl[fi].eqs[ei].pts.push({ id: uid(), label: 'Nouveau point' }); }
  saveTpl().then(vSettings);
};
acts.resettpl = async () => { if (!confirm('Remplacer tout le modèle par le modèle Seya d\'origine ? Tes modifications du modèle seront perdues (les audits existants ne changent pas).')) return; await setMeta('template', buildTpl(DEFAULT_TPL)); vSettings(); };

/* ---------- Sauvegarde / restauration ---------- */
async function vBackup() {
  shell('Sauvegarde', '/');
  const audits = await dbAll('audits'), last = await getMeta('lastBackup');
  let persisted = 'inconnu', usage = '';
  try { persisted = (await navigator.storage.persisted()) ? 'activé ✓' : 'non accordé'; const e = await navigator.storage.estimate(); usage = (e.usage / 1048576).toFixed(1) + ' Mo utilisés'; } catch { }
  main.innerHTML = `<h1>Sauvegarde</h1><p class="sub">Tes audits sont stockés uniquement sur cet appareil. Le fichier de sauvegarde contient tout : audits, photos et modèle.</p>
    <div class="card"><b>${audits.length} audit(s)</b><div class="m">Dernière sauvegarde : ${last ? new Date(last).toLocaleString('fr-FR') : 'jamais'}<br>Stockage protégé : ${persisted}${usage ? ' · ' + usage : ''}</div></div>
    <button class="btn main" data-act="export">Sauvegarder tous mes audits (fichier)</button>
    <label class="btn" style="cursor:pointer">Restaurer depuis un fichier<input type="file" accept=".json,application/json" data-chg="import" hidden></label>
    <p class="ghost">Conseil : envoie le fichier vers OneDrive ou AirDrop après chaque audit, et pour changer de téléphone.</p>`;
}
acts.export = async () => {
  modal('<h2 style="margin-top:0">Préparation…</h2>');
  try {
    const audits = await dbAll('audits'), photos = await dbAll('photos'), template = await getMeta('template');
    const ph = []; for (const p of photos) ph.push({ ...p, blob: await blobURL(p.blob) });
    const blob = new Blob([JSON.stringify({ app: 'seya-audit', version: 1, date: new Date().toISOString(), audits, photos: ph, template })], { type: 'application/json' });
    window._bk = { blob, name: `Seya-Audit-Sauvegarde_${today()}.json` };
    modal(`<h2 style="margin-top:0">Sauvegarde prête ✓</h2><p class="sub">${(blob.size / 1048576).toFixed(1)} Mo</p><button class="btn main" data-m="bk">Enregistrer / partager le fichier</button><button class="btn" data-m="close">Fermer</button>`);
  } catch (e) { modal(`<p>Erreur : ${esc(e.message)}</p><button class="btn" data-m="close">Fermer</button>`); }
};
macts.bk = async () => { if (await deliver(window._bk.blob, window._bk.name, 'application/json')) { await setMeta('lastBackup', Date.now()); closeModal(); route(); } };
inps.import = async t => {
  const f = t.files[0]; t.value = ''; if (!f) return;
  try {
    const d = JSON.parse(await f.text()); if (d.app !== 'seya-audit') throw new Error('Ce fichier n\'est pas une sauvegarde Audit Seya.');
    if (!confirm(`Restaurer ${d.audits.length} audit(s) ? Les audits de même identifiant seront remplacés, les autres conservés.`)) return;
    for (const a of d.audits) await dbPut('audits', a);
    for (const p of d.photos) await dbPut('photos', { ...p, blob: await (await fetch(p.blob)).blob() });
    if (d.template) await setMeta('template', d.template);
    alert('Restauration terminée.'); route();
  } catch (e) { alert('Erreur : ' + e.message); }
};

/* ---------- Démarrage ---------- */
(async function init() {
  try { await navigator.storage?.persist?.(); } catch { }
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => { });
  if (!location.hash) { const lr = ls.get('lastRoute'); if (lr && /^#\/a\//.test(lr)) { location.hash = lr; return; } }
  route();
})();
