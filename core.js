/* ==========================================================================
   Minecraft Series Writer — core.js
   Persistenza (IndexedDB + fallback localStorage), stato normalizzato,
   pub/sub, CRUD con cascate, statistiche derivate, ricerca, export/import,
   snapshot, utility UI (toast, modal, conferme, drag&drop).
   Nessuna dipendenza esterna. Funziona anche in Node (per i test).
   ========================================================================== */
(function (global) {
  'use strict';

  var APP_NAME = 'Minecraft Series Writer';
  var APP_VERSION = '1.0.0';
  var IDB_NAME = 'minecraft-series-writer';
  var IDB_VERSION = 1;
  var STORE = 'records';
  var KV = 'kv';
  var LS_KEY = 'mcsw.state.v1';
  var LS_META = 'mcsw.meta.v1';

  /* ------------------------------------------------------------------ utils */
  function uid(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }
  function nowISO() { return new Date().toISOString(); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function unesc(s) {
    return String(s == null ? '' : s).replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
      .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&nbsp;/g, ' ');
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function fmtDate(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d)) return '—';
    return pad(d.getDate()) + '/' + pad(d.getMonth() + 1) + '/' + d.getFullYear();
  }
  function fmtTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso); if (isNaN(d)) return '—';
    return pad(d.getHours()) + ':' + pad(d.getMinutes());
  }
  function isToday(iso) {
    if (!iso) return false;
    var d = new Date(iso), n = new Date();
    return d.getDate() === n.getDate() && d.getMonth() === n.getMonth() && d.getFullYear() === n.getFullYear();
  }
  function humanDate(iso) {
    if (!iso) return '—';
    if (isToday(iso)) return 'oggi, ' + fmtTime(iso);
    var d = new Date(iso), n = new Date();
    var yest = new Date(n.getTime() - 86400000);
    if (d.getDate() === yest.getDate() && d.getMonth() === yest.getMonth() && d.getFullYear() === yest.getFullYear())
      return 'ieri, ' + fmtTime(iso);
    return fmtDate(iso) + ', ' + fmtTime(iso);
  }
  function debounce(fn, ms) {
    var t = null;
    return function () {
      var args = arguments, self = this;
      clearTimeout(t);
      t = setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  function parseInt0(v) { var n = parseInt(v, 10); return isNaN(n) ? 0 : n; }
  function clamp(n, a, b) { return Math.min(b, Math.max(a, n)); }
  function nf(n) { return String(n == null ? 0 : n).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
  function deepClone(o) { return JSON.parse(JSON.stringify(o)); }
  function byOrder(a, b) { return (a.order || 0) - (b.order || 0); }

  /* rimuove i blocchi nota autore e i tag: puro testo (funziona anche in Node) */
  function stripNotes(html) {
    var s = String(html == null ? '' : html);
    s = s.replace(/<(div|p|span|section)[^>]*class\s*=\s*"[^"]*(?:author-note|note)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, ' ');
    s = s.replace(/<br\s*\/?>/gi, ' ').replace(/<\/(p|div|h[1-6]|li|blockquote)>/gi, ' ');
    s = s.replace(/<[^>]*>/g, '');
    s = unesc(s).replace(/\s+/g, ' ').trim();
    return s;
  }
  function wordCount(html) {
    var t = stripNotes(html);
    if (!t) return 0;
    return t.split(/\s+/).filter(function (w) { return w.length > 0; }).length;
  }
  function excerpt(html, len) {
    var t = stripNotes(html);
    len = len || 160;
    return t.length > len ? t.slice(0, len - 1) + '…' : t;
  }
  /* elimina i blocchi nota per la modalità lettura */
  function stripNotesForReading(html) {
    var s = String(html == null ? '' : html);
    s = s.replace(/<(div|p|span|section)[^>]*class\s*=\s*"[^"]*(?:author-note|note)[^"]*"[^>]*>[\s\S]*?<\/\1>/gi, '');
    return s;
  }

  /* ------------------------------------------------------- schema / enum */
  var ENUM = {
    alignment: ['Buono', 'Cattivo', 'Neutrale', 'Ambiguo', 'Variabile'],
    role: ['Protagonista', 'Co-protagonista', 'Antagonista', 'Antagonista secondario', 'Personaggio secondario', 'Personaggio ricorrente', 'Cameo'],
    importance: ['Principale', 'Ricorrente', 'Occasionale'],
    chapterStatus: ['Idea', 'Pianificato', 'In scrittura', 'In revisione', 'Completo'],
    relationType: ['Amico', 'Alleato', 'Nemico', 'Rivale', 'Maestro', 'Allievo', 'Familiare', 'Interesse romantico', 'Rapporto ambiguo', 'Manipolatore', 'Vittima', 'Altro'],
    locationCategory: ['Città', 'Villaggi', 'Castelli', 'Dungeon', 'Foreste', 'Dimensioni', 'Basi', 'Regni', 'Luoghi speciali'],
    objectCategory: ['Arma', 'Armatura', 'Artefatto', 'Pozione', 'Blocco', 'Strumento', 'Chiave', 'Reliquia', 'Altro'],
    ideaCategory: ['Personaggio', 'Scena', 'Dialogo', 'Evento', 'Lore', 'Combattimento', 'Battuta', 'Finale', 'Da sviluppare'],
    noteTag: ['DA CONTROLLARE', 'DA SISTEMARE', 'INSERIRE DIALOGO', 'IDEA PER IL FINALE', 'PERSONAGGIO DA RIPRENDERE', 'CONTINUITÀ', 'RICERCA', 'ALTRO']
  };
  var CAST_GROUPS = [
    { key: 'protagonists', icon: '⭐', title: 'Protagonisti', desc: 'Personaggi principali della storia.', roles: ['Protagonista', 'Co-protagonista'] },
    { key: 'antagonists', icon: '☠️', title: 'Antagonisti', desc: 'Personaggi che rappresentano i principali conflitti o minacce.', roles: ['Antagonista', 'Antagonista secondario'] },
    { key: 'secondary', icon: '👥', title: 'Personaggi secondari', desc: 'Presenza meno costante, ma con archi, eventi e relazioni propri.', roles: ['Personaggio secondario'] },
    { key: 'others', icon: '👤', title: 'Altri / Ricorrenti', desc: 'Personaggi minori, comparse, NPC, presenze occasionali.', roles: ['Personaggio ricorrente', 'Cameo'] }
  ];
  function roleGroup(role) {
    if (role === 'Protagonista' || role === 'Co-protagonista') return 'protagonists';
    if (role === 'Antagonista' || role === 'Antagonista secondario') return 'antagonists';
    if (role === 'Personaggio secondario') return 'secondary';
    return 'others';
  }
  function alignClass(a) {
    return a === 'Buono' ? 'good' : a === 'Cattivo' ? 'bad' : a === 'Neutrale' ? 'neut' : a === 'Ambiguo' ? 'amb' : 'var';
  }
  function statusClass(s) {
    return s === 'Idea' ? 'st-idea' : s === 'Pianificato' ? 'st-plan' : s === 'In scrittura' ? 'st-writing'
      : s === 'In revisione' ? 'st-rev' : 'st-done';
  }

  /* ----------------------------------------------------------- root state */
  var COLLECTIONS = ['seasons', 'chapters', 'sections', 'scenes', 'characters', 'locations', 'objects', 'events', 'relations', 'ideas', 'notes', 'snapshots'];

  function defaultProject() {
    return {
      id: 'project',
      name: 'La mia serie Minecraft',
      author: '',
      description: '',
      language: 'it',
      createdAt: nowISO(),
      updatedAt: nowISO(),
      settings: { autosave: true, autoBackup: true, fontScale: 1, seeded: false, autosaveMs: 2000 }
    };
  }
  function emptyState() {
    var s = { project: defaultProject() };
    COLLECTIONS.forEach(function (c) { s[c] = []; });
    return s;
  }

  var state = emptyState();
  var storageMode = 'unknown';
  var idb = null;

  /* ------------------------------------------------------- pub/sub engine */
  var subs = [];
  var queued = false;
  function subscribe(fn) { subs.push(fn); return function () { subs = subs.filter(function (f) { return f !== fn; }); }; }
  function emit(reason) {
    if (queued) return;
    queued = true;
    var run = function () { queued = false; subs.slice().forEach(function (f) { try { f(reason || 'data'); } catch (e) { console.error(e); } }); };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(run); else setTimeout(run, 0);
  }

  /* -------------------------------------------------------- save tracking */
  var saveStatus = 'idle';
  var lastSavedAt = null;
  var statusSubs = [];
  function onStatus(fn) { statusSubs.push(fn); fn(saveStatus, lastSavedAt); }
  function setStatus(st) {
    saveStatus = st;
    statusSubs.forEach(function (f) { try { f(saveStatus, lastSavedAt); } catch (e) {} });
  }

  /* ------------------------------------------------------ IndexedDB layer */
  function openIDB() {
    return new Promise(function (resolve) {
      try {
        if (!global.indexedDB) return resolve(null);
        var settled = false;
        var t = setTimeout(function () { if (!settled) { settled = true; resolve(null); } }, 2500);
        var req = global.indexedDB.open(IDB_NAME, IDB_VERSION);
        req.onupgradeneeded = function () {
          var db = req.result;
          if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
          if (!db.objectStoreNames.contains(KV)) db.createObjectStore(KV, { keyPath: 'k' });
        };
        req.onsuccess = function () { if (!settled) { settled = true; clearTimeout(t); resolve(req.result); } };
        req.onerror = function () { if (!settled) { settled = true; clearTimeout(t); resolve(null); } };
        req.onblocked = function () { if (!settled) { settled = true; clearTimeout(t); resolve(null); } };
      } catch (e) { resolve(null); }
    });
  }
  function idbAll(db, store) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction(store, 'readonly');
        var req = tx.objectStore(store).getAll();
        req.onsuccess = function () { resolve(req.result || []); };
        req.onerror = function () { resolve([]); };
      } catch (e) { resolve([]); }
    });
  }
  function idbBulkPut(db, store, rows) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(store, 'readwrite');
        var os = tx.objectStore(store);
        rows.forEach(function (r) { os.put(r); });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
        tx.onabort = function () { reject(tx.error); };
      } catch (e) { reject(e); }
    });
  }
  function idbBulkDelete(db, store, ids) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = db.transaction(store, 'readwrite');
        var os = tx.objectStore(store);
        ids.forEach(function (id) { os.delete(id); });
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { reject(tx.error); };
      } catch (e) { reject(e); }
    });
  }
  function idbClearAll(db) {
    return new Promise(function (resolve) {
      try {
        var tx = db.transaction([STORE, KV], 'readwrite');
        tx.objectStore(STORE).clear();
        tx.objectStore(KV).clear();
        tx.oncomplete = function () { resolve(true); };
        tx.onerror = function () { resolve(false); };
      } catch (e) { resolve(false); }
    });
  }

  /* --------------------------------------------------------- persistence */
  var pending = new Map();      // id -> {kind, data} | null (delete)
  var lastDelete = null;        // ultimo elemento eliminato (per la rimozione mirata)
  var flushTimer = null;

  function localSave(metaOnly) {
    try {
      if (!metaOnly) global.localStorage.setItem(LS_KEY, JSON.stringify(serialize()));
      global.localStorage.setItem(LS_META, JSON.stringify({ lastSavedAt: lastSavedAt, mode: 'localstorage' }));
      return true;
    } catch (e) {
      setStatus('error');
      console.warn('localStorage non disponibile', e);
      return false;
    }
  }

  function scheduleFlush() {
    clearTimeout(flushTimer);
    flushTimer = setTimeout(flush, 400);
  }

  function queue(kind, rec) { pending.set(rec.id, { kind: kind, data: rec }); setStatus('saving'); scheduleFlush(); }
  function queueDelete(id) { pending.set(id, null); setStatus('saving'); scheduleFlush(); }
  function queueMeta(kvRow) { pending.set('__kv_' + kvRow.k, { kind: 'kv', data: kvRow }); setStatus('saving'); scheduleFlush(); }

  function flush() {
    if (!pending.size) { if (saveStatus !== 'saved') setStatus('saved'); return Promise.resolve(true); }
    var rows = [], ids = [], kvs = [];
    pending.forEach(function (v, id) {
      if (v === null) ids.push(id);
      else if (v.kind === 'kv') kvs.push(v.data);
      else rows.push({ id: id, kind: v.kind, data: v.data });
    });
    pending.clear();
    setStatus('saving');
    var done = function (ok) {
      lastSavedAt = nowISO();
      try { global.localStorage.setItem(LS_META, JSON.stringify({ lastSavedAt: lastSavedAt, mode: storageMode })); } catch (e) {}
      setStatus(ok ? 'saved' : 'error');
    };
    if (storageMode === 'indexeddb' && idb) {
      return Promise.all([
        rows.length ? idbBulkPut(idb, STORE, rows) : true,
        kvs.length ? idbBulkPut(idb, KV, kvs) : true,
        ids.length ? idbBulkDelete(idb, STORE, ids) : true
      ]).then(function () { done(true); return true; })
        .catch(function (e) { console.warn('Scrittura IndexedDB fallita, passo a localStorage', e); storageMode = 'localstorage'; localSave(); done(true); return true; });
    }
    var ok = localSave();
    done(ok);
    return Promise.resolve(ok);
  }

  /* ------------------------------------------------------------- loading */
  function serialize() {
    var out = { project: state.project };
    COLLECTIONS.forEach(function (c) { out[c] = state[c]; });
    return out;
  }
  function applyState(data) {
    var st = emptyState();
    st.project = Object.assign(defaultProject(), data.project || {});
    st.project.settings = Object.assign({ autosave: true, autoBackup: true, fontScale: 1, seeded: false, autosaveMs: 2000 }, (data.project && data.project.settings) || {});
    COLLECTIONS.forEach(function (c) { st[c] = Array.isArray(data[c]) ? data[c] : []; });
    state = st;
  }

  function loadFromLocal() {
    try {
      var raw = global.localStorage.getItem(LS_KEY);
      if (raw) { applyState(JSON.parse(raw)); return true; }
    } catch (e) { console.warn('Lettura localStorage fallita', e); }
    return false;
  }

  var readyPromise = null;
  function init() {
    if (readyPromise) return readyPromise;
    readyPromise = (async function () {
      idb = await openIDB();
      if (idb) {
        storageMode = 'indexeddb';
        var rows = await idbAll(idb, STORE);
        var kvs = await idbAll(idb, KV);
        if (rows.length || kvs.length) {
          var data = {};
          rows.forEach(function (r) {
            if (r.kind === 'project') data.project = r.data;
            else { if (!data[r.kind]) data[r.kind] = []; data[r.kind].push(r.data); }
          });
          kvs.forEach(function (k) { if (k.k === 'project' && k.data) data.project = k.data; });
          applyState(data);
        } else {
          // database vuoto: prova localStorage (es. migrazione) poi seed
          if (!loadFromLocal()) { applyState(emptyState()); }
        }
      } else {
        storageMode = 'localstorage';
        if (!loadFromLocal()) applyState(emptyState());
      }
      // normalizza: ogni record creato prima non deve rompere le viste
      COLLECTIONS.forEach(function (c) {
        state[c] = (state[c] || []).filter(function (r) { return r && r.id; });
      });
      if (!state.project.settings.seeded) { seed(true); }
      return state;
    })();
    return readyPromise;
  }

  /* ------------------------------------------------------------------ CRUD */
  var DB = {
    get state() { return state; },
    get mode() { return storageMode; },
    get lastSavedAt() { return lastSavedAt; },
    project: function () { return state.project; },
    list: function (kind) { return state[kind] || []; },
    get: function (kind, id) { return (state[kind] || []).find(function (r) { return r.id === id; }) || null; },
    exists: function (kind, id) { return !!DB.get(kind, id); },

    create: function (kind, patch, opts) {
      var rec = Object.assign({}, patch || {});
      if (!rec.id) rec.id = uid(kind.slice(0, 3));
      if (!rec.createdAt) rec.createdAt = nowISO();
      rec.updatedAt = nowISO();
      if (rec.order == null) rec.order = nextOrder(kind);
      state[kind].push(rec);
      if (!(opts && opts.silent)) { queue(kind, rec); emit('create'); }
      else { queue(kind, rec); }
      return rec;
    },
    update: function (kind, id, patch, opts) {
      var rec = DB.get(kind, id);
      if (!rec) return null;
      Object.assign(rec, patch);
      rec.updatedAt = nowISO();
      queue(kind, rec);
      if (!(opts && opts.silent)) emit('update');
      return rec;
    },
    updateSilent: function (kind, id, patch) { return DB.update(kind, id, patch, { silent: true }); },
    touch: function (kind, id) { return DB.update(kind, id, {}, { silent: true }); },
    save: function (kind, id) { var r = DB.get(kind, id); if (r) { r.updatedAt = nowISO(); queue(kind, r); } return r; },
    remove: function (kind, id, opts) { return removeRecord(kind, id, opts); },
    replaceAll: function (newState) {
      applyState(newState);
      persistEverything();
      emit('replace');
    },
    clearAll: async function () {
      state = emptyState();
      pending.clear();
      if (idb) await idbClearAll(idb);
      try { global.localStorage.removeItem(LS_KEY); } catch (e) {}
      emit('replace');
    },
    setProject: function (patch) {
      Object.assign(state.project, patch, { updatedAt: nowISO() });
      queueMeta({ k: 'project', data: state.project });
      emit('project');
    },
    reorder: function (kind, id, dir, filterFn) {
      var list = (state[kind] || []).filter(function (r) { return !filterFn || filterFn(r); }).sort(byOrder);
      var i = list.findIndex(function (r) { return r.id === id; });
      if (i < 0) return;
      var j = dir < 0 ? i - 1 : i + 1;
      if (j < 0 || j >= list.length) return;
      var a = list[i], b = list[j];
      var ao = a.order == null ? i : a.order, bo = b.order == null ? j : b.order;
      a.order = bo; b.order = ao;
      a.updatedAt = nowISO(); b.updatedAt = nowISO();
      queue(kind, a); queue(kind, b);
      emit('reorder');
    },
    moveToIndex: function (kind, id, targetIndex, filterFn) {
      var list = (state[kind] || []).filter(function (r) { return !filterFn || filterFn(r); }).sort(byOrder);
      var i = list.findIndex(function (r) { return r.id === id; });
      if (i < 0 || targetIndex < 0 || targetIndex >= list.length || i === targetIndex) return;
      var item = list.splice(i, 1)[0];
      list.splice(targetIndex, 0, item);
      list.forEach(function (r, idx) { r.order = idx; queue(kind, r); });
      emit('reorder');
    }
  };

  function nextOrder(kind, filterFn) {
    var max = -1;
    (state[kind] || []).forEach(function (r) {
      if (filterFn && !filterFn(r)) return;
      var o = r.order == null ? 0 : r.order;
      if (o > max) max = o;
    });
    return max + 1;
  }

  /* cascate di cancellazione: nessun dato orfano */
  function removeRecord(kind, id, opts) {
    var rec = DB.get(kind, id);
    if (!rec) return false;
    var i = state[kind].indexOf(rec);
    if (i >= 0) state[kind].splice(i, 1);
    function drop(k, rid) {
      var r = DB.get(k, rid);
      if (r) { state[k].splice(state[k].indexOf(r), 1); queueDelete(rid); }
    }
    if (kind === 'chapters') {
      DB.list('sections').filter(function (s) { return s.chapterId === id; }).forEach(function (s) { removeRecord('sections', s.id, { silent: true }); });
      DB.list('events').filter(function (e) { return e.chapterId === id; }).forEach(function (e) { DB.update('events', e.id, { chapterId: null, sectionId: null, sceneId: null }, { silent: true }); });
    }
    if (kind === 'sections') {
      DB.list('scenes').filter(function (s) { return s.sectionId === id; }).forEach(function (s) { drop('scenes', s.id); });
      DB.list('events').filter(function (e) { return e.sectionId === id; }).forEach(function (e) { DB.update('events', e.id, { sectionId: null }, { silent: true }); });
    }
    if (kind === 'scenes') {
      DB.list('events').filter(function (e) { return e.sceneId === id; }).forEach(function (e) { DB.update('events', e.id, { sceneId: null }, { silent: true }); });
    }
    if (kind === 'characters') {
      DB.list('sections').forEach(function (s) {
        if ((s.characterIds || []).indexOf(id) >= 0) DB.update('sections', s.id, { characterIds: s.characterIds.filter(function (x) { return x !== id; }) }, { silent: true });
      });
      DB.list('scenes').forEach(function (s) {
        if ((s.characterIds || []).indexOf(id) >= 0) DB.update('scenes', s.id, { characterIds: s.characterIds.filter(function (x) { return x !== id; }) }, { silent: true });
      });
      DB.list('events').forEach(function (e) {
        if ((e.characterIds || []).indexOf(id) >= 0) DB.update('events', e.id, { characterIds: e.characterIds.filter(function (x) { return x !== id; }) }, { silent: true });
      });
      DB.list('locations').forEach(function (l) {
        if ((l.characterIds || []).indexOf(id) >= 0) DB.update('locations', l.id, { characterIds: l.characterIds.filter(function (x) { return x !== id; }) }, { silent: true });
      });
      DB.list('relations').filter(function (r) { return r.fromId === id || r.toId === id; }).forEach(function (r) { drop('relations', r.id); });
    }
    if (kind === 'locations') {
      DB.list('sections').forEach(function (s) { if (s.locationId === id) DB.update('sections', s.id, { locationId: null }, { silent: true }); });
      DB.list('scenes').forEach(function (s) { if (s.locationId === id) DB.update('scenes', s.id, { locationId: null }, { silent: true }); });
      DB.list('events').forEach(function (e) { if (e.locationId === id) DB.update('events', e.id, { locationId: null }, { silent: true }); });
      DB.list('objects').forEach(function (o) { if (o.locationId === id) DB.update('objects', o.id, { locationId: null }, { silent: true }); });
    }
    if (kind === 'objects') {
      DB.list('relations').forEach(function (r) { if (r.objectId === id) DB.update('relations', r.id, { objectId: null }, { silent: true }); });
    }
    queueDelete(id);
    lastDelete = { kind: kind, id: id };
    if (!(opts && opts.silent)) emit('delete');
    return true;
  }

  function persistEverything() {
    var rows = [];
    COLLECTIONS.forEach(function (c) {
      (state[c] || []).forEach(function (r) { rows.push({ id: r.id, kind: c, data: r }); });
    });
    rows.push({ id: 'project', kind: 'project', data: state.project });
    pending.clear();
    setStatus('saving');
    if (storageMode === 'indexeddb' && idb) {
      idbClearAll(idb).then(function () {
        return idbBulkPut(idb, STORE, rows).then(function () {
          return idbBulkPut(idb, KV, [{ k: 'project', data: state.project }]);
        });
      }).then(function () { lastSavedAt = nowISO(); setStatus('saved'); })
        .catch(function () { storageMode = 'localstorage'; localSave(); lastSavedAt = nowISO(); setStatus('saved'); });
    } else { localSave(); lastSavedAt = nowISO(); setStatus('saved'); }
  }

  /* ------------------------------------------------- derived collections */
  function sectionsOf(chapterId) { return DB.list('sections').filter(function (s) { return s.chapterId === chapterId; }).sort(byOrder); }
  function scenesOf(sectionId) { return DB.list('scenes').filter(function (s) { return s.sectionId === sectionId; }).sort(byOrder); }
  function scenesOfChapter(chapterId) {
    return DB.list('scenes').filter(function (s) { return s.chapterId === chapterId; }).sort(function (a, b) { return (a.order || 0) - (b.order || 0); });
  }
  function eventsOfChapter(chapterId) { return DB.list('events').filter(function (e) { return e.chapterId === chapterId; }).sort(byOrder); }
  function chaptersSorted() { return DB.list('chapters').slice().sort(function (a, b) { return (a.number || 0) - (b.number || 0); }); }
  function relationsOf(charId) { return DB.list('relations').filter(function (r) { return r.fromId === charId || r.toId === charId; }); }
  function objectsOfChar(charId) { return DB.list('objects').filter(function (o) { return (o.ownerIds || []).indexOf(charId) >= 0; }); }

  function chapterOfSection(sec) { return sec && sec.chapterId ? DB.get('chapters', sec.chapterId) : null; }
  function chapterOfScene(sc) { return sc && sc.chapterId ? DB.get('chapters', sc.chapterId) : null; }
  function sectionOfScene(sc) { return sc && sc.sectionId ? DB.get('sections', sc.sectionId) : null; }

  /* presenza di un personaggio: tutto DERIVATO dai collegamenti, mai duplicato */
  function presenceOf(charId) {
    var chapters = {}, scenes = 0, sections = 0, evs = 0, locs = {};
    DB.list('sections').forEach(function (s) {
      if ((s.characterIds || []).indexOf(charId) >= 0) {
        sections++;
        if (s.chapterId) chapters[s.chapterId] = true;
        if (s.locationId) locs[s.locationId] = true;
      }
    });
    DB.list('scenes').forEach(function (s) {
      if ((s.characterIds || []).indexOf(charId) >= 0) {
        scenes++;
        if (s.chapterId) chapters[s.chapterId] = true;
        if (s.locationId) locs[s.locationId] = true;
      }
    });
    DB.list('events').forEach(function (e) {
      if ((e.characterIds || []).indexOf(charId) >= 0) {
        evs++;
        if (e.chapterId) chapters[e.chapterId] = true;
      }
    });
    var chIds = Object.keys(chapters).filter(function (id) { return !!DB.get('chapters', id); });
    var ordered = chIds.map(function (id) { return DB.get('chapters', id); }).sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
    return {
      chapters: ordered,
      chapterIds: ordered.map(function (c) { return c.id; }),
      sceneCount: scenes,
      sectionCount: sections,
      eventCount: evs,
      locationIds: Object.keys(locs),
      firstChapter: ordered[0] || null,
      lastChapter: ordered[ordered.length - 1] || null,
      words: ordered.reduce(function (acc, c) { return acc + chapterWordCount(c.id); }, 0)
    };
  }

  function chapterWordCount(chapterId) {
    var w = 0;
    sectionsOf(chapterId).forEach(function (s) { w += wordCount(s.text); });
    scenesOfChapter(chapterId).forEach(function (s) { w += wordCount(s.text); });
    var ch = DB.get('chapters', chapterId);
    if (ch) w += wordCount(ch.description);
    return w;
  }
  function totalWords() {
    var w = 0;
    DB.list('chapters').forEach(function (c) { w += chapterWordCount(c.id); });
    return w;
  }
  function chapterStats(chapterId) {
    var sections = sectionsOf(chapterId), scenes = scenesOfChapter(chapterId);
    var chars = {}, locs = {};
    sections.forEach(function (s) {
      (s.characterIds || []).forEach(function (c) { chars[c] = true; });
      if (s.locationId) locs[s.locationId] = true;
    });
    scenes.forEach(function (s) {
      (s.characterIds || []).forEach(function (c) { chars[c] = true; });
      if (s.locationId) locs[s.locationId] = true;
    });
    eventsOfChapter(chapterId).forEach(function (e) {
      (e.characterIds || []).forEach(function (c) { chars[c] = true; });
      if (e.locationId) locs[e.locationId] = true;
    });
    var ch = DB.get('chapters', chapterId);
    return {
      sections: sections.length,
      scenes: scenes.length,
      words: chapterWordCount(chapterId),
      characterIds: Object.keys(chars).filter(function (id) { return !!DB.get('characters', id); }),
      locationIds: Object.keys(locs).filter(function (id) { return !!DB.get('locations', id); }),
      events: eventsOfChapter(chapterId),
      charsManual: (ch && ch.characterIds) || []
    };
  }
  function totals() {
    var chars = DB.list('characters');
    var byGroup = { protagonists: 0, antagonists: 0, secondary: 0, others: 0 };
    var byAlign = {};
    chars.forEach(function (c) {
      byGroup[roleGroup(c.role)]++;
      byAlign[c.alignment || '—'] = (byAlign[c.alignment || '—'] || 0) + 1;
    });
    return {
      chapters: DB.list('chapters').length,
      seasons: DB.list('seasons').length,
      sections: DB.list('sections').length,
      scenes: DB.list('scenes').length,
      characters: chars.length,
      byGroup: byGroup,
      byAlign: byAlign,
      locations: DB.list('locations').length,
      events: DB.list('events').length,
      objects: DB.list('objects').length,
      ideas: DB.list('ideas').length,
      notes: DB.list('notes').filter(function (n) { return n.status !== 'risolta'; }).length,
      words: totalWords()
    };
  }

  /* cose da sistemare: note aperte, idee non sviluppate, buchi nei dati */
  function todoList() {
    var out = [];
    DB.list('notes').filter(function (n) { return n.status !== 'risolta'; }).forEach(function (n) {
      out.push({ id: n.id, icon: '📝', kind: 'Nota', title: n.tag || 'Nota', text: n.text, route: '#/notes/' + n.id });
    });
    DB.list('ideas').filter(function (i) { return i.status !== 'sviluppata'; }).forEach(function (i) {
      out.push({ id: i.id, icon: '💡', kind: 'Idea', title: i.category || 'Idea', text: i.text, route: '#/ideas/' + i.id });
    });
    DB.list('events').forEach(function (e) {
      if (!stripNotes(e.consequences)) out.push({ id: e.id, icon: '⚔️', kind: 'Evento', title: e.title || 'Evento', text: 'Nessuna conseguenza indicata', route: '#/events/' + e.id });
    });
    DB.list('characters').forEach(function (c) {
      var a = c.arc || {};
      if (!stripNotes(a.inizio) && !stripNotes(a.sviluppo) && !stripNotes(a.svolta) && !stripNotes(a.evoluzione)) {
        out.push({ id: c.id, icon: '👤', kind: 'Personaggio', title: c.name || 'Personaggio', text: 'Arco narrativo non ancora definito', route: '#/characters/' + c.id });
      }
    });
    DB.list('sections').forEach(function (s) {
      var sc = scenesOf(s.id);
      if (!sc.length && !stripNotes(s.text)) out.push({ id: s.id, icon: '🧩', kind: 'Sezione', title: s.title || 'Sezione', text: 'Sezione vuota: nessuna scena né testo', route: '#/writing/section/' + s.id });
    });
    return out;
  }

  /* ---------------------------------------------------------------- search */
  function snippet(html, q, len) {
    var t = stripNotes(typeof html === 'string' ? html : '');
    len = len || 150;
    if (!q) return t.slice(0, len) + (t.length > len ? '…' : '');
    var i = t.toLowerCase().indexOf(q.toLowerCase());
    if (i < 0) return t.slice(0, len) + (t.length > len ? '…' : '');
    var start = Math.max(0, i - 50);
    return (start > 0 ? '…' : '') + t.slice(start, start + len) + (start + len < t.length ? '…' : '');
  }
  function hi(text, q) {
    var t = esc(text == null ? '' : text);
    if (!q) return t;
    try {
      return t.replace(new RegExp('(' + q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + ')', 'gi'), '<mark>$1</mark>');
    } catch (e) { return t; }
  }
  function match(q, fields) {
    if (!q) return 0;
    var score = 0, lq = q.toLowerCase();
    fields.forEach(function (f, idx) {
      var v = stripNotes(typeof f === 'string' ? f : '').toLowerCase();
      if (!v) return;
      if (v === lq) score += 100 - idx;
      else if (v.indexOf(lq) === 0) score += 60 - idx;
      else if (v.indexOf(lq) >= 0) score += 30 - idx;
      else if (lq.length > 3 && v.indexOf(lq.slice(0, 4)) >= 0) score += 5;
    });
    return score;
  }
  function searchAll(q) {
    q = (q || '').trim();
    if (!q) return { groups: [], total: 0 };
    var groups = [];
    function push(label, icon, rows) { if (rows.length) groups.push({ label: label, icon: icon, rows: rows.sort(function (a, b) { return b.score - a.score; }) }); }

    push('Personaggi', '👥', DB.list('characters').map(function (c) {
      var s = match(q, [c.name, c.alias, c.faction, c.species, c.personality, c.backstory, c.goals, c.secrets, c.quotes]);
      return s ? { score: s, title: c.name || 'Senza nome', sub: (c.alias ? '«' + c.alias + '» · ' : '') + (c.alignment || '') + ' · ' + (c.role || ''), snippet: snippet([c.personality, c.backstory, c.notes].filter(Boolean).join(' — '), q), route: '#/characters/' + c.id, icon: '👤' } : null;
    }).filter(Boolean));

    push('Capitoli', '📚', DB.list('chapters').map(function (c) {
      var s = match(q, [c.title, c.subtitle, c.description, c.authorNotes]);
      return s ? { score: s, title: 'Capitolo ' + (c.number || '?') + ' — ' + (c.title || 'Senza titolo'), sub: c.status || '', snippet: snippet([c.subtitle, c.description].filter(Boolean).join(' — '), q), route: '#/chapters/' + c.id, icon: '📖' } : null;
    }).filter(Boolean));

    push('Sezioni', '🧩', DB.list('sections').map(function (s) {
      var ch = chapterOfSection(s);
      var sc = match(q, [s.title, s.description, s.objective, s.conflict, s.consequence, s.text, s.notes]);
      return sc ? { score: sc, title: s.title || 'Sezione', sub: ch ? 'Capitolo ' + (ch.number || '?') + ' — ' + ch.title : 'Sezione', snippet: snippet([s.description, s.text].filter(Boolean).join(' — '), q), route: '#/writing/section/' + s.id, icon: '🧩' } : null;
    }).filter(Boolean));

    push('Scene', '🎬', DB.list('scenes').map(function (s) {
      var ch = chapterOfScene(s), se = sectionOfScene(s);
      var sc = match(q, [s.title, s.text, s.notes]);
      return sc ? { score: sc, title: s.title || 'Scena', sub: [ch ? 'Cap. ' + (ch.number || '?') : null, se ? se.title : null].filter(Boolean).join(' · '), snippet: snippet(s.text, q), route: '#/writing/scene/' + s.id, icon: '🎬' } : null;
    }).filter(Boolean));

    push('Luoghi', '🌍', DB.list('locations').map(function (l) {
      var sc = match(q, [l.name, l.category, l.description, l.position, l.faction, l.inhabitants, l.secrets]);
      return sc ? { score: sc, title: l.name || 'Senza nome', sub: l.category || '', snippet: snippet([l.description, l.position].filter(Boolean).join(' — '), q), route: '#/locations/' + l.id, icon: '🌍' } : null;
    }).filter(Boolean));

    push('Eventi', '⚔️', DB.list('events').map(function (e) {
      var sc = match(q, [e.title, e.description, e.consequences, e.narrativeDate]);
      return sc ? { score: sc, title: e.title || 'Evento', sub: e.narrativeDate || '', snippet: snippet([e.description, e.consequences].filter(Boolean).join(' — '), q), route: '#/events/' + e.id, icon: '⚔️' } : null;
    }).filter(Boolean));

    push('Oggetti', '🧱', DB.list('objects').map(function (o) {
      var sc = match(q, [o.name, o.category, o.description, o.powers, o.origin]);
      return sc ? { score: sc, title: o.name || 'Oggetto', sub: o.category || '', snippet: snippet([o.description, o.powers].filter(Boolean).join(' — '), q), route: '#/objects/' + o.id, icon: '🧱' } : null;
    }).filter(Boolean));

    push('Idee', '💡', DB.list('ideas').map(function (i) {
      var sc = match(q, [i.text, i.category]);
      return sc ? { score: sc, title: i.category || 'Idea', sub: i.status === 'sviluppata' ? 'sviluppata' : 'da sviluppare', snippet: snippet(i.text, q), route: '#/ideas/' + i.id, icon: '💡' } : null;
    }).filter(Boolean));

    push('Note', '📝', DB.list('notes').map(function (n) {
      var sc = match(q, [n.text, n.tag]);
      return sc ? { score: sc, title: n.tag || 'Nota', sub: n.status === 'risolta' ? 'risolta' : 'aperta', snippet: snippet(n.text, q), route: '#/notes/' + n.id, icon: '📝' } : null;
    }).filter(Boolean));

    push('Relazioni', '🔗', DB.list('relations').map(function (r) {
      var a = DB.get('characters', r.fromId), b = DB.get('characters', r.toId);
      var nm = (a ? a.name : '?') + ' → ' + (b ? b.name : '?') + ' (' + (r.type || '') + ')';
      var sc = match(q, [nm, r.description]);
      return sc ? { score: sc, title: nm, sub: r.type || '', snippet: snippet(r.description, q), route: '#/characters/' + (r.fromId || ''), icon: '🔗' } : null;
    }).filter(Boolean));

    var total = groups.reduce(function (a, g) { return a + g.rows.length; }, 0);
    return { groups: groups, total: total };
  }

  /* --------------------------------------------------------- snapshot etc */
  function snapshotData() { return { project: deepClone(state.project), collections: COLLECTIONS.reduce(function (a, c) { a[c] = deepClone(state[c]); return a; }, {}) }; }
  function createSnapshot(name, opts) {
    var snap = {
      id: uid('snap'),
      name: name || ('Versione del ' + fmtDate(nowISO()) + ' ' + fmtTime(nowISO())),
      auto: !!(opts && opts.auto),
      createdAt: nowISO(),
      counts: { chapters: DB.list('chapters').length, characters: DB.list('characters').length, words: totalWords() },
      data: snapshotData()
    };
    state.snapshots.push(snap);
    state.snapshots.sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
    if (state.snapshots.length > 40) {
      var removed = state.snapshots.splice(40, state.snapshots.length - 40);
      removed.forEach(function (r) { queueDelete(r.id); });
    }
    queue('snapshots', snap);
    emit('snapshot');
    return snap;
  }
  function restoreSnapshot(id) {
    var snap = DB.get('snapshots', id);
    if (!snap || !snap.data) return false;
    applyState({ project: snap.data.project, chapters: snap.data.collections.chapters, characters: snap.data.collections.characters, sections: snap.data.collections.sections, scenes: snap.data.collections.scenes, locations: snap.data.collections.locations, objects: snap.data.collections.objects, events: snap.data.collections.events, relations: snap.data.collections.relations, ideas: snap.data.collections.ideas, notes: snap.data.collections.notes, seasons: snap.data.collections.seasons, snapshots: state.snapshots });
    persistEverything();
    emit('restore');
    return true;
  }
  function exportJSON() {
    return {
      app: APP_NAME,
      appVersion: APP_VERSION,
      schema: 1,
      exportedAt: nowISO(),
      project: deepClone(state.project),
      collections: COLLECTIONS.reduce(function (a, c) { a[c] = deepClone(state[c]); return a; }, {}),
      counts: totals()
    };
  }
  function importJSON(obj, mode) {
    if (!obj || typeof obj !== 'object') throw new Error('JSON non valido');
    var colls = obj.collections || obj;
    var data = { project: obj.project || state.project };
    COLLECTIONS.forEach(function (c) {
      if (Array.isArray(colls[c])) data[c] = colls[c];
      else if (Array.isArray(obj[c])) data[c] = obj[c];
      // in modalità "merge" i dati esistenti vengono mantenuti
      else if (mode === 'merge') data[c] = state[c];
      else data[c] = [];
    });
    if (mode === 'merge') {
      COLLECTIONS.forEach(function (c) {
        (data[c] || []).forEach(function (rec) {
          var existing = DB.get(c, rec.id);
          if (existing) Object.assign(existing, rec);
          else state[c].push(rec);
        });
      });
      persistEverything();
      emit('import');
    } else {
      data.project = Object.assign(defaultProject(), data.project || {});
      data.project.settings = Object.assign({}, data.project.settings);
      data.project.settings.seeded = true;
      applyState(data);
      persistEverything();
      emit('import');
    }
    return totals();
  }

  /* ----------------------------------------------------------- demo seed */
  function seed(force) {
    if (state.project.settings.seeded && !force) return false;
    var t = Date.now();
    function ts(i) { return new Date(t - (20 - (i || 0)) * 3600000).toISOString(); }
    var c1 = 'chap_1', c2 = 'chap_2';
    var sec1 = 'sec_1', sec2 = 'sec_2', sec3 = 'sec_3';
    var chars = [
      {
        id: 'char_shadow', name: 'Shadow', alias: 'L\'ombra del villaggio', image: '', alignment: 'Buono', role: 'Protagonista', importance: 'Principale',
        personality: 'Determinato, riflessivo, protettivo verso i suoi compagni. Parla poco ma osserva tutto.',
        appearance: 'Figura alta avvolta in un mantello scuro, occhi verdi come il minerale incantato.',
        age: '24', species: 'Umano (toccato dal Nether)', faction: 'Guardiani di Pietraverde',
        abilities: 'Spada di diamante, sopravvivenza estrema', powers: 'Percezione delle ombre, resistenza al fuoco', weapons: 'Lama di diamante, arco incantato',
        strengths: 'Sangue freddo, lealtà', weaknesses: 'Troppa fiducia in Kokushibo, notti insonni',
        goals: 'Proteggere il villaggio e chiudere il portale del Nether.', fears: 'Perdere ancora qualcuno come ai tempi dell\'assedio.',
        backstory: 'È cresciuto tra le rovine di un villaggio bruciato e ha imparato a combattere da solo.',
        secrets: 'Sa che il portale del Nether fu aperto da un membro della sua stessa famiglia.',
        quotes: '«Se resto fermo, la notte vince.»', firstAppearance: 'Capitolo 1', lastAppearance: 'Capitolo 1',
        arc: { inizio: 'Sopravvissuto solitario che evita il villaggio.', sviluppo: 'Accetta di guidare i difensori di Pietraverde.', svolta: 'Scopre che il portale del Nether è stato aperto da qualcuno che conosce.', evoluzione: 'Da guardiano solitario a punto di riferimento del gruppo.', attuale: 'Sta addestrando i nuovi difensori.', futuro: 'Dovrà scegliere tra vendetta e ricostruzione.' },
        notes: '', createdAt: ts(19), updatedAt: ts(2)
      },
      {
        id: 'char_kokushibo', name: 'Kokushibo', alias: 'Il Sei Occhi', image: '', alignment: 'Cattivo', role: 'Antagonista', importance: 'Principale',
        personality: 'Calmo, glaciale, ossessionato dalla perfezione delle tecniche di combattimento.',
        appearance: 'Sei occhi dorati, armatura nera con venature di quarzo, respiro sempre visibile come fumo.',
        age: 'Sconosciuta', species: 'Entità corrotta dall\'End', faction: 'Ordine del Vuoto',
        abilities: 'Lama della Luna, tecniche di riflesso', powers: 'Rigenerazione, manipolazione del vetro nero', weapons: 'Katana in ossidiana incantata',
        strengths: 'Precisione assoluta, impossibile da sorprendere', weaknesses: 'Disprezza chi non è all\'altezza: sottovaluta gli avversari tenaci',
        goals: 'Recuperare il Nucleo di Venia e riscrivere la mappa del mondo.', fears: 'Il degrado del proprio corpo.',
        backstory: 'Era un maestro d\'armi prima di scendere nell\'End; da allora non invecchia più.',
        secrets: 'Ogni volta che usa la tecnica proibita perde un ricordo di sua figlia.',
        quotes: '«La tua tecnica... è ancora insufficiente.»', firstAppearance: 'Capitolo 1', lastAppearance: 'Capitolo 1',
        arc: { inizio: 'Minaccia lontana di cui si parla solo nelle leggende.', sviluppo: 'Compare al villaggio e mette in ginocchio i difensori.', svolta: 'Riconosce in Shadow un potenziale allievo.', evoluzione: '', attuale: 'Osserva il gruppo senza attaccare.', futuro: 'Diventerà lo specchio delle scelte di Shadow.' },
        notes: '[DA CONTROLLARE] Controllare quante volte può usare la tecnica proibita.', createdAt: ts(18), updatedAt: ts(3)
      },
      {
        id: 'char_diablo', name: 'Diablo', alias: 'Il Cappello Rosso', image: '', alignment: 'Ambiguo', role: 'Co-protagonista', importance: 'Principale',
        personality: 'Ironico, teatrale, imprevedibile; aiuta gli altri per noia più che per bontà.',
        appearance: 'Cappello a cilindro, sorriso costante, ombra che non segue il corpo.', age: 'Apparentemente 30', species: 'Demone esiliato', faction: 'Nessuna',
        abilities: 'Illusioni, contratti verbali', powers: 'Teletrasporto breve, voce ipnotica', weapons: 'Bastone da passeggio, carte di nullità',
        strengths: 'Imprevedibile, ottimo negoziatore', weaknesses: 'Non mantiene mai una promessa fino in fondo',
        goals: 'Trovare qualcosa che valga la pena di desiderare.', fears: 'La noia eterna.',
        backstory: 'Espulso dal Nether per un contratto che ha truccato.', secrets: 'Conosce il vero nome di Kokushibo.',
        quotes: '«Facciamo così: io ti aiuto, tu mi diverti.»', firstAppearance: 'Capitolo 1', lastAppearance: 'Capitolo 1',
        arc: { inizio: 'Comparsa inattesa che si offre di aiutare per gioco.', sviluppo: 'Si affeziona al gruppo nonostante sé stesso.', svolta: '', evoluzione: '', attuale: 'Segue Shadow senza ammetterlo.', futuro: '' },
        notes: '', createdAt: ts(17), updatedAt: ts(4)
      },
      {
        id: 'char_alastor', name: 'Alastor', alias: 'Il Radio Demone', image: '', alignment: 'Ambiguo', role: 'Personaggio ricorrente', importance: 'Ricorrente',
        personality: 'Parla sempre con un sorriso, ama i microfoni, interrompe i momenti gravi con battute.',
        appearance: 'Giacca rossa, occhi gialli, corna appena visibili, radio fluttuante.', age: 'Ignota', species: 'Demone delle trasmissioni', faction: 'Nessuna',
        abilities: 'Trasmissioni a distanza, manipolazione dell\'attenzione', powers: 'Voci multiple, controllo dei suoni', weapons: 'Microfono che amplifica il terrore',
        strengths: 'Informazioni da ogni angolo del mondo', weaknesses: 'Deve sempre essere il centro dell\'attenzione',
        goals: 'Trasmettere la storia di ciò che accade.', fears: 'Il silenzio.',
        backstory: 'Ha iniziato a trasmettere quando il mondo ha smesso di ascoltare.', secrets: 'Registra ogni conversazione che sente.',
        quotes: '«Signore e signori: che spettacolo!»', firstAppearance: 'Capitolo 1', lastAppearance: 'Capitolo 1',
        arc: { inizio: '', sviluppo: '', svolta: '', evoluzione: '', attuale: 'Osserva il primo incontro dal tetto della torre.', futuro: '' },
        notes: '', createdAt: ts(16), updatedAt: ts(5)
      },
      {
        id: 'char_luna', name: 'Luna', alias: 'La guaritrice', image: '', alignment: 'Buono', role: 'Personaggio secondario', importance: 'Ricorrente',
        personality: 'Paziente, cinica in superficie, generosa nei fatti.', appearance: 'Capelli corti bianchi, camice verde, mani sempre sporche di polvere di lapis.',
        age: '31', species: 'Umana', faction: 'Guardiani di Pietraverde', abilities: 'Alchimia, pozioni', powers: '', weapons: '',
        strengths: 'Cura chiunque senza distinzioni', weaknesses: 'Non sa dire di no',
        goals: 'Costruire un ospedale nel villaggio.', fears: 'Restare senza pozioni durante un assedio.',
        backstory: 'Ha studiato al tempio di quarzo prima della guerra.', secrets: '', quotes: '«Bevi, o ti trascino io dentro la casa.»',
        firstAppearance: 'Capitolo 1', lastAppearance: 'Capitolo 1', arc: { inizio: '', sviluppo: '', svolta: '', evoluzione: '', attuale: '', futuro: '' }, notes: '', createdAt: ts(15), updatedAt: ts(6)
      },
      {
        id: 'char_guardiano', name: 'Guardiano di Pietraverde', alias: 'Il Vecchio di Pietra', image: '', alignment: 'Neutrale', role: 'Personaggio secondario', importance: 'Occasionale',
        personality: 'Silenzioso, si esprime per proverbi.', appearance: 'Golem di pietra muschiosa con gli occhi azzurri.', age: 'Ignota', species: 'Golem', faction: 'Villaggio di Pietraverde',
        abilities: 'Forza immensa, memoria del sottosuolo', powers: '', weapons: '', strengths: 'Non si stanca mai', weaknesses: 'Lentissimo nei movimenti',
        goals: 'Proteggere il villaggio come ha sempre fatto.', fears: '', backstory: '', secrets: 'Ricorda tutti i villaggi che sono caduti prima di questo.',
        quotes: '«La pietra ricorda più della gente.»', firstAppearance: 'Capitolo 1', lastAppearance: 'Capitolo 1',
        arc: { inizio: '', sviluppo: '', svolta: '', evoluzione: '', attuale: '', futuro: '' }, notes: '', createdAt: ts(14), updatedAt: ts(7)
      }
    ];

    var locs = [
      { id: 'loc_pietraverde', name: 'Villaggio di Pietraverde', category: 'Villaggi', image: '', description: 'Villaggio costruito attorno a un pozzo di pietra muschiosa; case in quercia e tetti in mattoni di pietra.', position: 'Pianura a ovest del Regno di Venia', inhabitants: 'Contadini, artigiani, una piccola guarnigione', faction: 'Guardiani di Pietraverde', characterIds: ['char_shadow', 'char_luna', 'char_guardiano', 'char_diablo'], secrets: 'Sotto il pozzo c\'è una camera sigillata con un portale inattivo.', notes: '', createdAt: ts(13), updatedAt: ts(3) },
      { id: 'loc_venia', name: 'Regno di Venia', category: 'Regni', image: '', description: 'Antica capitale fortificata, ora in parte in rovina dopo la caduta della corona.', position: 'Centro del continente', inhabitants: 'Nobili in esilio, mercanti', faction: 'Casata di Venia', characterIds: ['char_kokushibo'], secrets: 'Il trono nasconde una scala verso l\'End.', notes: '', createdAt: ts(12), updatedAt: ts(4) },
      { id: 'loc_nether', name: 'Nether — Distesa di Basalto', category: 'Dimensioni', image: '', description: 'Distesa rovente attraversata da fiumi di lava e da ponti di basalto.', position: 'Dimensione parallela', inhabitants: 'Piglins, entità corrotte', faction: 'Nessuna', characterIds: ['char_diablo', 'char_shadow'], secrets: 'Un vecchio ponte conduce a una fortezza abbandonata.', notes: '', createdAt: ts(11), updatedAt: ts(5) },
      { id: 'loc_torre', name: 'Torre dell\'Eco', category: 'Luoghi speciali', image: '', description: 'Torre di quarzo da cui Alastor trasmette: ogni suono vi torna indietro distorto.', position: 'Confine orientale di Pietraverde', inhabitants: 'Nessuno (ufficialmente)', faction: 'Nessuna', characterIds: ['char_alastor'], secrets: 'Al piano più alto c\'è la sala delle registrazioni.', notes: '', createdAt: ts(10), updatedAt: ts(6) }
    ];

    var chapters = [
      { id: c1, seasonId: null, number: 1, title: 'Il primo incontro', subtitle: 'Capitolo d\'apertura', status: 'In scrittura', description: 'Shadow arriva a Pietraverde nel momento sbagliato: il villaggio sta per essere attaccato e nessuno conosce il nemico che sta arrivando.', cover: '', authorNotes: 'Tenere il ritmo alto: ogni sezione deve finire con una domanda aperta.', order: 0, createdAt: ts(9), updatedAt: ts(2) },
      { id: c2, seasonId: null, number: 2, title: 'Il viaggio', subtitle: 'Verso il Nether', status: 'Pianificato', description: 'Il gruppo lascia il villaggio seguendo la traccia del Nucleo di Venia.', cover: '', authorNotes: '', order: 1, createdAt: ts(8), updatedAt: ts(7) }
    ];

    var sections = [
      { id: sec1, chapterId: c1, title: 'Il villaggio', description: 'Presentazione di Pietraverde e dei suoi abitanti prima della tempesta.', locationId: 'loc_pietraverde', characterIds: ['char_luna', 'char_guardiano'], objective: 'Far capire che il villaggio ha qualcosa da perdere.', conflict: 'La guarnigione è ridotta e le mura hanno una breccia.', consequence: 'Il villaggio resta vulnerabile.', text: '<h2>Il villaggio</h2><p>Le campane di Pietraverde suonavano due volte al giorno, e nessuno ricordava più il perché.</p><div class="dialogue"><span class="who">Luna:</span> «Se continui a fissare l\'orizzonte, prima o poi qualcosa arriva davvero.»</div>', notes: '', order: 0, createdAt: ts(9), updatedAt: ts(2) },
      { id: sec2, chapterId: c1, title: 'L\'arrivo di Shadow', description: 'Shadow entra nel villaggio e riconosce i segni di un attacco imminente.', locationId: 'loc_pietraverde', characterIds: ['char_shadow', 'char_diablo'], objective: 'Presentare Shadow e il suo istinto.', conflict: 'Nessuno vuole credere a un forestiero.', consequence: 'Shadow decide di restare comunque.', text: '<h2>L\'arrivo di Shadow</h2><p>Shadow entrò lentamente nella sala. Davanti a lui c\'era Kokushibo.</p><div class="dialogue"><span class="who">Diablo:</span> «Facciamo così: io ti aiuto, tu mi diverti.»</div>', notes: '', order: 1, createdAt: ts(8), updatedAt: ts(2) },
      { id: sec3, chapterId: c1, title: 'Il primo scontro', description: 'Lo scontro sulla piazza: Shadow contro Kokushibo.', locationId: 'loc_pietraverde', characterIds: ['char_shadow', 'char_kokushibo', 'char_alastor'], objective: 'Mostrare la differenza di forza tra i due.', conflict: 'Shadow non può vincere, può solo resistere.', consequence: 'Kokushibo si ritira, ma ha visto abbastanza.', text: '', notes: '[INSERIRE DIALOGO] Kokushibo deve dire la frase sulla tecnica insufficiente.', order: 2, createdAt: ts(7), updatedAt: ts(1) }
    ];

    var scenes = [
      { id: 'scn_1', chapterId: c1, sectionId: sec1, title: 'La breccia nelle mura', characterIds: ['char_luna', 'char_guardiano'], locationId: 'loc_pietraverde', text: '<p>Il guardiano di pietra trascinava i blocchi verso la breccia con la calma di chi ha già visto troppe guerre.</p><div class="dialogue"><span class="who">Guardiano:</span> «La pietra ricorda più della gente.»</div><div class="note">Riprendere questa frase nel finale.</div>', images: [], notes: '', order: 0, createdAt: ts(9), updatedAt: ts(3) },
      { id: 'scn_2', chapterId: c1, sectionId: sec1, title: 'Le campane', characterIds: ['char_luna'], locationId: 'loc_pietraverde', text: '<p>Luna contò le provviste due volte. Il secondo conteggio fu peggiore del primo.</p>', images: [], notes: '', order: 1, createdAt: ts(9), updatedAt: ts(4) },
      { id: 'scn_3', chapterId: c1, sectionId: sec2, title: 'Un forestiero alla porta', characterIds: ['char_shadow', 'char_guardiano'], locationId: 'loc_pietraverde', text: '<p>Shadow non chiese permesso. Si limitò a indicare la breccia e a dire quante notti mancavano.</p><div class="dialogue"><span class="who">Shadow:</span> «Se resto fermo, la notte vince.»</div>', images: [], notes: '', order: 0, createdAt: ts(8), updatedAt: ts(2) },
      { id: 'scn_4', chapterId: c1, sectionId: sec2, title: 'Il Cappello Rosso', characterIds: ['char_shadow', 'char_diablo'], locationId: 'loc_pietraverde', text: '<p>Diablo comparve sul tetto della torre senza che nessuno lo vedesse salire.</p><div class="dialogue"><span class="who">Diablo:</span> «Facciamo così: io ti aiuto, tu mi diverti.»</div>', images: [], notes: '', order: 1, createdAt: ts(8), updatedAt: ts(2) },
      { id: 'scn_5', chapterId: c1, sectionId: sec3, title: 'Shadow entra nella piazza', characterIds: ['char_shadow', 'char_luna', 'char_guardiano'], locationId: 'loc_pietraverde', text: '<p>La piazza era vuota e questo era il problema: significava che tutti stavano guardando dai bordi.</p>', images: [], notes: '', order: 0, createdAt: ts(7), updatedAt: ts(1) },
      { id: 'scn_6', chapterId: c1, sectionId: sec3, title: 'Arriva Kokushibo', characterIds: ['char_kokushibo', 'char_alastor'], locationId: 'loc_pietraverde', text: '<p>Il fumo lo precedeva. Sei occhi dorati scivolarono sulle case come se stessero già contando le perdite.</p>', images: [], notes: '', order: 1, createdAt: ts(7), updatedAt: ts(1) },
      { id: 'scn_7', chapterId: c1, sectionId: sec3, title: 'Inizia lo scontro', characterIds: ['char_shadow', 'char_kokushibo'], locationId: 'loc_pietraverde', text: '<p>Il primo colpo spaccò il selciato. Il secondo non arrivò: Shadow lo aveva già schivato.</p><div class="dialogue"><span class="who">Kokushibo:</span> «La tua tecnica... è ancora insufficiente.»</div>', images: [], notes: '', order: 2, createdAt: ts(6), updatedAt: ts(1) },
      { id: 'scn_8', chapterId: c1, sectionId: sec3, title: 'Il combattimento viene interrotto', characterIds: ['char_shadow', 'char_kokushibo', 'char_alastor'], locationId: 'loc_torre', text: '<p>Una risata amplificata fece tremare i vetri di ogni casa: Alastor stava trasmettendo l\'intero scontro.</p>', images: [], notes: '', order: 3, createdAt: ts(6), updatedAt: ts(1) }
    ];

    var events = [
      { id: 'ev_1', title: 'L\'arrivo di Shadow', description: 'Shadow entra a Pietraverde e capisce che il villaggio è in pericolo.', chapterId: c1, sectionId: sec2, sceneId: 'scn_3', narrativeDate: 'Giorno 1, mattina', locationId: 'loc_pietraverde', characterIds: ['char_shadow', 'char_guardiano'], consequences: 'Il villaggio ottiene un difensore in più, ma non si fida.', prevIds: [], nextIds: ['ev_2'], milestone: false, order: 0, createdAt: ts(8), updatedAt: ts(2) },
      { id: 'ev_2', title: 'Il primo scontro', description: 'Shadow affronta Kokushibo sulla piazza di Pietraverde.', chapterId: c1, sectionId: sec3, sceneId: 'scn_7', narrativeDate: 'Giorno 1, tramonto', locationId: 'loc_pietraverde', characterIds: ['char_shadow', 'char_kokushibo', 'char_alastor'], consequences: 'Kokushibo si ritira con un nuovo interesse; il villaggio è salvo per ora.', prevIds: ['ev_1'], nextIds: [], milestone: true, order: 1, createdAt: ts(7), updatedAt: ts(1) },
      { id: 'ev_3', title: 'La caduta del Regno di Venia', description: 'Il regno cade sotto l\'Ordine del Vuoto.', chapterId: c2, sectionId: null, sceneId: null, narrativeDate: 'Anno 3 della Cenere', locationId: 'loc_venia', characterIds: ['char_shadow', 'char_kokushibo', 'char_diablo'], consequences: '', prevIds: [], nextIds: [], milestone: true, order: 2, createdAt: ts(6), updatedAt: ts(5) }
    ];

    var relations = [
      { id: 'rel_1', fromId: 'char_shadow', toId: 'char_kokushibo', type: 'Nemico', description: 'Kokushibo considera Shadow un allievo possibile, Shadow lo considera una minaccia.', createdAt: ts(6), updatedAt: ts(3) },
      { id: 'rel_2', fromId: 'char_diablo', toId: 'char_shadow', type: 'Rapporto ambiguo', description: 'Diablo aiuta Shadow per divertimento, senza dichiararsi alleato.', createdAt: ts(6), updatedAt: ts(3) },
      { id: 'rel_3', fromId: 'char_luna', toId: 'char_shadow', type: 'Amico', description: 'Si conoscono da poco ma Luna si fida del suo istinto.', createdAt: ts(5), updatedAt: ts(3) },
      { id: 'rel_4', fromId: 'char_guardiano', toId: 'char_shadow', type: 'Maestro', description: 'Il guardiano gli insegna a leggere la pietra del sottosuolo.', createdAt: ts(5), updatedAt: ts(3) },
      { id: 'rel_5', fromId: 'char_alastor', toId: 'char_kokushibo', type: 'Manipolatore', description: 'Alastor trasmette le sue imprese per alimentare la leggenda.', createdAt: ts(5), updatedAt: ts(3) },
      { id: 'rel_6', fromId: 'char_kokushibo', toId: 'char_diablo', type: 'Vittima', description: 'Diablo ha truccato un contratto contro di lui, anni fa.', createdAt: ts(5), updatedAt: ts(3) }
    ];

    var objects = [
      { id: 'obj_1', name: 'Lama di Diamante', category: 'Arma', image: '', description: 'La spada di Shadow, incantata con Affilatura V.', origin: 'Forgiata a Pietraverde', powers: 'Taglia il vetro nero dell\'End', ownerIds: ['char_shadow'], locationId: null, notes: '', createdAt: ts(7), updatedAt: ts(3) },
      { id: 'obj_2', name: 'Nucleo di Venia', category: 'Reliquia', image: '', description: 'Sfera di quarzo che mantiene in piedi la capitale.', origin: 'Casata di Venia', powers: 'Risveglia i portali', ownerIds: ['char_kokushibo'], locationId: 'loc_venia', notes: '[DA CONTROLLARE] Decidere se è distruggibile.', createdAt: ts(7), updatedAt: ts(4) },
      { id: 'obj_3', name: 'Microfono d\'Eco', category: 'Artefatto', image: '', description: 'Amplifica qualsiasi suono fino a farlo diventare terrore.', origin: 'Torre dell\'Eco', powers: 'Trasmissione a distanza', ownerIds: ['char_alastor'], locationId: 'loc_torre', notes: '', createdAt: ts(7), updatedAt: ts(4) }
    ];

    var ideas = [
      { id: 'idea_1', text: 'Far incontrare Shadow e Kokushibo nel Nether, senza armi.', category: 'Scena', status: 'aperta', createdAt: ts(5), updatedAt: ts(5) },
      { id: 'idea_2', text: 'Diablo rivela di conoscere il vero nome di Kokushibo in cambio di un favore.', category: 'Lore', status: 'aperta', createdAt: ts(4), updatedAt: ts(4) },
      { id: 'idea_3', text: 'Luna scopre che le pozioni del tempio funzionano anche sull\'End.', category: 'Da sviluppare', status: 'aperta', createdAt: ts(3), updatedAt: ts(3) },
      { id: 'idea_4', text: '«Signore e signori: che spettacolo!» come battuta finale del capitolo 1.', category: 'Battuta', status: 'sviluppata', createdAt: ts(2), updatedAt: ts(1) }
    ];

    var notes = [
      { id: 'note_1', text: 'Controllare la timeline: il primo scontro deve avvenire prima della caduta di Venia.', tag: 'DA CONTROLLARE', status: 'aperta', chapterId: c1, createdAt: ts(4), updatedAt: ts(3) },
      { id: 'note_2', text: 'Alastor deve tornare nel finale, con una registrazione del primo scontro.', tag: 'PERSONAGGIO DA RIPRENDERE', status: 'aperta', chapterId: null, createdAt: ts(4), updatedAt: ts(2) },
      { id: 'note_3', text: 'Inserire un dialogo tra Luna e il Guardiano nella sezione 1.', tag: 'INSERIRE DIALOGO', status: 'aperta', chapterId: c1, createdAt: ts(3), updatedAt: ts(1) },
      { id: 'note_4', text: 'Idea per il finale: il portale si chiude dall\'interno.', tag: 'IDEA PER IL FINALE', status: 'aperta', chapterId: null, createdAt: ts(2), updatedAt: ts(1) }
    ];

    state.characters = chars;
    state.locations = locs;
    state.chapters = chapters;
    state.sections = sections;
    state.scenes = scenes;
    state.events = events;
    state.relations = relations;
    state.objects = objects;
    state.ideas = ideas;
    state.notes = notes;
    state.seasons = [{ id: 'season_1', number: 1, title: 'Stagione 1 — La Cenere', subtitle: 'Capitoli 1-2', description: 'Dall\'arrivo di Shadow fino alla caduta di Venia.', order: 0, createdAt: ts(9), updatedAt: ts(3) }];
    state.project.settings.seeded = true;
    if (!state.project.name || state.project.name === 'La mia serie Minecraft') state.project.name = 'Minecraft — La Cenere';
    state.project.author = state.project.author || '';
    state.project.description = state.project.description || 'Serie fantasy ambientata in un mondo Minecraft: Pietraverde, il Regno di Venia e il Nether.';
    state.project.seededAt = nowISO();
    persistEverything();
    return true;
  }

  /* backup automatico: snapshot leggeri ogni 5 minuti di attività */
  var autoBackupTimer = null;
  function startAutoBackup() {
    if (autoBackupTimer) return;
    autoBackupTimer = setInterval(function () {
      if (!state.project.settings.autoBackup) return;
      var last = state.snapshots.filter(function (s) { return s.auto; })[0];
      if (last && (Date.now() - new Date(last.createdAt).getTime()) < 4 * 60000) return;
      if (!DB.list('chapters').length) return;
      createSnapshot('Backup automatico ' + fmtTime(nowISO()), { auto: true });
      var autos = state.snapshots.filter(function (s) { return s.auto; });
      autos.slice(3).forEach(function (s) {
        var i = state.snapshots.indexOf(s);
        if (i >= 0) { state.snapshots.splice(i, 1); queueDelete(s.id); }
      });
    }, 5 * 60000);
  }

  /* ------------------------------------------------- intervallo di salvataggio */
  /* --------------------------------------------------- TEMI (aspetto) */
  var THEMES = [
    { id: 'viola', label: 'Viola', c: '#a78bfa' },
    { id: 'blu', label: 'Blu', c: '#60a5fa' },
    { id: 'verde', label: 'Verde', c: '#4ade80' },
    { id: 'ambra', label: 'Ambra', c: '#fbbf24' },
    { id: 'rosso', label: 'Rosso', c: '#f87171' }
  ];
  var THEME_KEY = 'mcw_theme';
  function theme() {
    try { var v = global.localStorage.getItem(THEME_KEY); return v || 'viola'; } catch (e) { return 'viola'; }
  }
  function applyTheme(id) {
    try { document.documentElement.setAttribute('data-theme', id || theme()); } catch (e) {}
    return id || theme();
  }
  function setTheme(id) {
    try { global.localStorage.setItem(THEME_KEY, id); } catch (e) {}
    applyTheme(id);
    emit('theme');
    return id;
  }

  var AUTOSAVE_CHOICES = [
    { ms: 1000, label: 'Ogni secondo' },
    { ms: 2000, label: 'Ogni 2 secondi (consigliato)' },
    { ms: 5000, label: 'Ogni 5 secondi' },
    { ms: 10000, label: 'Ogni 10 secondi' },
    { ms: 30000, label: 'Ogni 30 secondi' },
    { ms: 60000, label: 'Ogni minuto' },
    { ms: 0, label: 'Solo manuale (pulsante Salva)' }
  ];
  function autosaveMs() {
    var v = state.project.settings && state.project.settings.autosaveMs;
    if (v === undefined || v === null) return 2000;
    return parseInt0(v);
  }
  function setAutosave(ms) {
    var s = Object.assign({}, state.project.settings);
    s.autosaveMs = parseInt0(ms);
    s.autosave = parseInt0(ms) > 0;
    DB.setProject({ settings: s });
    emit('settings');
  }
  function markDirty() { if (saveStatus !== 'dirty' && saveStatus !== 'saving') setStatus('dirty'); }
  function saveNow() {
    return flush().then(function (ok) { setStatus(ok === false ? 'error' : 'saved'); return ok; });
  }

  /* ============================================================ UI helpers */
  function toast(msg, type, ms) {
    var host = global.document && document.getElementById('toasts');
    if (!host) { return; }
    var el = document.createElement('div');
    el.className = 'toast' + (type ? ' ' + type : '');
    el.textContent = msg;
    host.appendChild(el);
    setTimeout(function () {
      el.style.transition = 'opacity .25s, transform .25s';
      el.style.opacity = '0';
      el.style.transform = 'translateY(8px)';
      setTimeout(function () { if (el.parentNode) el.parentNode.removeChild(el); }, 260);
    }, ms || 2600);
  }

  var modalStack = [];
  function openModal(opts) {
    var root = document.getElementById('modalRoot');
    if (!root) return null;
    var wrap = document.createElement('div');
    wrap.className = 'modal-wrap';
    wrap.style.cssText = 'position:absolute;inset:0;display:flex;align-items:center;justify-content:center;padding:inherit';
    var size = opts.size === 'sm' ? ' sm' : opts.size === 'xl' ? ' xl' : '';
    var backLabel = modalStack.length ? '← Indietro' : 'Chiudi';
    wrap.innerHTML =
      '<div class="modal-scrim" data-m="close"></div>' +
      '<div class="modal' + size + '" role="dialog" aria-modal="true">' +
      '<div class="modal-head">' +
      (opts.icon ? '<span style="font-size:18px">' + opts.icon + '</span>' : '') +
      '<h3>' + esc(opts.title || '') + '</h3>' +
      (opts.headRight || '') +
      '<button class="icon-btn" data-m="close" title="' + backLabel + '" style="width:34px;height:34px">✕</button>' +
      '</div>' +
      '<div class="modal-body">' + (opts.body || '') + '</div>' +
      (opts.footer ? '<div class="modal-foot">' + opts.footer + '</div>' : '') +
      '</div>';
    root.appendChild(wrap);
    root.hidden = false;
    var entry = { wrap: wrap, onClose: opts.onClose };
    modalStack.push(entry);
    wrap.addEventListener('click', function (ev) {
      var t = ev.target.closest('[data-m]');
      if (t && t.getAttribute('data-m') === 'close') closeModal();
    });
    if (opts.after) opts.after(wrap);
    return wrap;
  }
  function closeModal() {
    var entry = modalStack.pop();
    if (!entry) return;
    if (entry.onClose) { try { entry.onClose(); } catch (e) {} }
    if (entry.wrap && entry.wrap.parentNode) entry.wrap.parentNode.removeChild(entry.wrap);
    var root = document.getElementById('modalRoot');
    if (root && !modalStack.length) root.hidden = true;
  }
  function closeAllModals() { while (modalStack.length) closeModal(); }

  function confirmDialog(message, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      openModal({
        title: opts.title || 'Conferma', icon: opts.icon || '⚠️', size: 'sm',
        body: '<p style="margin:0">' + esc(message) + '</p>' + (opts.detail ? '<p class="small muted" style="margin:10px 0 0">' + esc(opts.detail) + '</p>' : ''),
        footer: '<button class="btn ghost" data-c="no">Annulla</button><button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-c="yes">' + esc(opts.ok || 'Conferma') + '</button>',
        after: function (wrap) {
          wrap.querySelector('[data-c="no"]').onclick = function () { resolve(false); closeModal(); };
          wrap.querySelector('[data-c="yes"]').onclick = function () { resolve(true); closeModal(); };
        },
        onClose: function () { resolve(false); }
      });
    });
  }

  function promptDialog(title, opts) {
    opts = opts || {};
    return new Promise(function (resolve) {
      openModal({
        title: title, icon: opts.icon || '✏️', size: 'sm',
        body: '<label class="f">' + esc(opts.label || '') + '</label><input type="text" id="pdVal" value="' + esc(opts.value || '') + '" placeholder="' + esc(opts.placeholder || '') + '" />',
        footer: '<button class="btn ghost" data-c="no">Annulla</button><button class="btn primary" data-c="yes">' + esc(opts.ok || 'Salva') + '</button>',
        after: function (wrap) {
          var input = wrap.querySelector('#pdVal');
          input.focus(); input.select();
          function ok() { var v = input.value.trim(); resolve(v || null); closeModal(); }
          input.onkeydown = function (e) { if (e.key === 'Enter') ok(); };
          wrap.querySelector('[data-c="no"]').onclick = function () { closeModal(); resolve(null); };
          wrap.querySelector('[data-c="yes"]').onclick = ok;
        },
        onClose: function () { resolve(null); }
      });
    });
  }

  function imgToDataURL(file) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onload = function () { resolve(fr.result); };
      fr.onerror = reject;
      fr.readAsDataURL(file);
    });
  }

  /* drag & drop riordino (mouse) + i pulsanti ▲▼ coprono il touch */
  function makeSortable(container, onReorder) {
    if (!container) return;
    var dragged = null;
    container.querySelectorAll('[data-drag-id]').forEach(function (row) {
      row.draggable = true;
      row.addEventListener('dragstart', function (e) {
        dragged = row.getAttribute('data-drag-id');
        row.classList.add('dragging');
        try { e.dataTransfer.setData('text/plain', dragged); } catch (err) {}
        e.dataTransfer.effectAllowed = 'move';
      });
      row.addEventListener('dragend', function () {
        row.classList.remove('dragging');
        container.querySelectorAll('.drop-target').forEach(function (r) { r.classList.remove('drop-target'); });
        dragged = null;
      });
      row.addEventListener('dragover', function (e) {
        if (!dragged) return;
        e.preventDefault();
        row.classList.add('drop-target');
      });
      row.addEventListener('dragleave', function () { row.classList.remove('drop-target'); });
      row.addEventListener('drop', function (e) {
        e.preventDefault();
        row.classList.remove('drop-target');
        var target = row.getAttribute('data-drag-id');
        if (dragged && target && dragged !== target) onReorder(dragged, target);
      });
    });
  }

  /* ------------------------------------------------------------------- API */
  var MCW = {
    APP_NAME: APP_NAME, APP_VERSION: APP_VERSION,
    ENUM: ENUM, CAST_GROUPS: CAST_GROUPS,
    uid: uid, esc: esc, unesc: unesc, fmtDate: fmtDate, fmtTime: fmtTime, humanDate: humanDate,
    debounce: debounce, clamp: clamp, nf: nf, pad: pad, deepClone: deepClone, parseInt0: parseInt0,
    stripNotes: stripNotes, stripNotesForReading: stripNotesForReading, wordCount: wordCount, excerpt: excerpt,
    roleGroup: roleGroup, alignClass: alignClass, statusClass: statusClass,
    DB: DB, init: init, subscribe: subscribe, emit: emit, onStatus: onStatus,
    lastDeleteInfo: function () { return lastDelete; },
    flush: flush, persistEverything: persistEverything,
    sectionsOf: sectionsOf, scenesOf: scenesOf, scenesOfChapter: scenesOfChapter, eventsOfChapter: eventsOfChapter,
    chaptersSorted: chaptersSorted, relationsOf: relationsOf, objectsOfChar: objectsOfChar,
    chapterOfSection: chapterOfSection, chapterOfScene: chapterOfScene, sectionOfScene: sectionOfScene,
    presenceOf: presenceOf, chapterWordCount: chapterWordCount, chapterStats: chapterStats,
    totalWords: totalWords, totals: totals, todoList: todoList,
    searchAll: searchAll, snippet: snippet, hi: hi,
    createSnapshot: createSnapshot, restoreSnapshot: restoreSnapshot, exportJSON: exportJSON, importJSON: importJSON,
    startAutoBackup: startAutoBackup, seed: seed,
    AUTOSAVE_CHOICES: AUTOSAVE_CHOICES, autosaveMs: autosaveMs, setAutosave: setAutosave,
    THEMES: THEMES, theme: theme, setTheme: setTheme, applyTheme: applyTheme,
    markDirty: markDirty, saveNow: saveNow,
    toast: toast, openModal: openModal, closeModal: closeModal, closeAllModals: closeAllModals,
    confirmDialog: confirmDialog, promptDialog: promptDialog, imgToDataURL: imgToDataURL, makeSortable: makeSortable,
    _internal: { state: function () { return state; }, applyState: applyState, emptyState: emptyState, queue: queue, queueDelete: queueDelete }
  };

  if (typeof module !== 'undefined' && module.exports) module.exports = MCW;
  global.MCW = MCW;
})(typeof globalThis !== 'undefined' ? globalThis : this);
