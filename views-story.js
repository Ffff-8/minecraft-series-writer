/* ==========================================================================
   views-story.js — Dashboard, Capitoli, Scrittura (editor), Modalità lettura
   Registra inoltre MCW.ui: helper condivisi da tutte le viste.
   ========================================================================== */
(function (global) {
  'use strict';
  var MCW = global.MCW; if (!MCW) return;
  var DB = MCW.DB, esc = MCW.esc, nf = MCW.nf, E = MCW.ENUM;
  var ui = MCW.ui = MCW.ui || {};
  MCW.views = MCW.views || {};

  var KIND_ROUTE = {
    characters: '#/characters/', locations: '#/locations/', events: '#/events/', objects: '#/objects/',
    chapters: '#/chapters/', sections: '#/writing/section/', scenes: '#/writing/scene/', ideas: '#/ideas/', notes: '#/notes/'
  };
  var KIND_LABEL = {
    characters: 'Personaggio', locations: 'Luogo', events: 'Evento', objects: 'Oggetto', chapters: 'Capitolo',
    sections: 'Sezione', scenes: 'Scena', ideas: 'Idea', notes: 'Nota', relations: 'Relazione', seasons: 'Stagione', snapshots: 'Versione'
  };
  var KIND_ICON = {
    characters: '👤', locations: '🌍', events: '⚔️', objects: '🧱', chapters: '📖', sections: '🧩',
    scenes: '🎬', ideas: '💡', notes: '📝', seasons: '🗓️', relations: '🔗'
  };
  ui.KIND_ROUTE = KIND_ROUTE; ui.KIND_LABEL = KIND_LABEL; ui.KIND_ICON = KIND_ICON;
  ui.routeFor = function (kind, id) { return (KIND_ROUTE[kind] || '#/dashboard') + id; };

  /* ------------------------------------------------------------- primitives */
  ui.pill = function (t, cls) { return t ? '<span class="pill ' + (cls || '') + '">' + esc(t) + '</span>' : ''; };
  ui.alignPill = function (a) { return a ? '<span class="pill ' + MCW.alignClass(a) + '">' + esc(a) + '</span>' : ''; };
  ui.rolePill = function (r) { return r ? '<span class="pill role">' + esc(r) + '</span>' : ''; };
  ui.statusPill = function (s) { return '<span class="badge-status ' + MCW.statusClass(s) + '">' + esc(s || '—') + '</span>'; };
  ui.presencePill = function (p) { return p ? '<span class="pill ghost">' + esc(p) + '</span>' : ''; };
  ui.initials = function (name) {
    var parts = String(name || '?').trim().split(/\s+/).slice(0, 2);
    return parts.map(function (p) { return p.charAt(0).toUpperCase(); }).join('') || '?';
  };
  ui.avatar = function (rec, size) {
    var cls = 'avatar' + (size ? ' ' + size : '');
    if (rec && rec.image) return '<img class="' + cls + '" src="' + esc(rec.image) + '" alt="' + esc(rec.name || '') + '" />';
    var ico = rec && rec.category ? '🌍' : (rec && rec.role ? '👤' : '📦');
    if (rec && rec.name && rec.role) return '<div class="' + cls + '">' + esc(ui.initials(rec.name)) + '</div>';
    return '<div class="' + cls + '">' + ico + '</div>';
  };
  ui.chip = function (kind, id, label) {
    if (!id) return '';
    var rec = DB.get(kind, id);
    if (!rec) return '<span class="chip muted">' + esc(label || 'elemento eliminato') + '</span>';
    var name = rec.name || rec.title || label || '—';
    return '<span class="chip clickable" data-open="' + kind + '" data-id="' + id + '">' +
      KIND_ICON[kind] + (label === false ? '' : ' ' + esc(name)) + '</span>';
  };
  ui.charChip = function (id) { return ui.chip('characters', id); };
  ui.chips = function (kind, ids, empty) {
    ids = ids || [];
    if (!ids.length) return '<span class="muted small">' + esc(empty || 'Nessuno') + '</span>';
    return ids.map(function (id) { return ui.chip(kind, id); }).join(' ');
  };
  ui.kv = function (label, value) {
    if (value == null || value === '') return '';
    return '<div class="field"><label class="f">' + esc(label) + '</label><div>' + value + '</div></div>';
  };
  ui.textKv = function (label, value, asHtml) {
    if (!value) return '';
    return '<div class="field"><label class="f">' + esc(label) + '</label><div>' +
      (asHtml ? value : esc(String(value)).replace(/\n/g, '<br>')) + '</div></div>';
  };
  ui.effDate = function (rec) { return MCW.fmtDate(rec.createdAt); };
  ui.updDate = function (rec) { return MCW.humanDate(rec.updatedAt); };

  /* --------------------------------------------------------------- form kit */
  ui.field = function (o) {
    var k = o.k, v = o.value == null ? '' : o.value, id = 'f_' + k + '_' + Math.random().toString(36).slice(2, 6);
    var lab = '<label class="f" for="' + id + '">' + esc(o.label || k) + '</label>';
    if (o.type === 'textarea') {
      return '<div class="field">' + lab + '<textarea id="' + id + '" data-field="' + k + '" rows="' + (o.rows || 3) + '" placeholder="' + esc(o.ph || '') + '">' + esc(v) + '</textarea>' + (o.hint ? '<div class="xsmall muted">' + esc(o.hint) + '</div>' : '') + '</div>';
    }
    if (o.type === 'select') {
      return '<div class="field">' + lab + '<select id="' + id + '" data-field="' + k + '">' +
        (o.options || []).map(function (op) {
          var ov = (op && typeof op === 'object') ? op.value : op;
          var ol = (op && typeof op === 'object') ? op.label : op;
          return '<option value="' + esc(ov) + '"' + (String(ov) === String(v) ? ' selected' : '') + '>' + esc(ol) + '</option>';
        }).join('') +
        '</select></div>';
    }
    if (o.type === 'checkbox') {
      return '<div class="field"><label class="chk"><input type="checkbox" data-field="' + k + '"' + (v ? ' checked' : '') + ' /> ' + esc(o.label || k) + '</label></div>';
    }
    if (o.type === 'image') {
      return '<div class="field">' + lab +
        '<div class="img-pick">' +
        '<div class="prev">' + (v ? '<img src="' + esc(v) + '" style="width:100%;height:100%;object-fit:cover;border-radius:9px" />' : '🖼️') + '</div>' +
        '<div class="row tight"><button type="button" class="btn sm" data-img="pick">Scegli immagine</button>' +
        '<button type="button" class="btn sm ghost" data-img="clear">Rimuovi</button></div>' +
        '<input type="file" accept="image/*" hidden />' +
        '<input type="hidden" data-field="' + k + '" value="' + esc(v) + '" />' +
        '</div><div class="xsmall muted">L\'immagine viene compressa e salvata nel browser (nessun upload).</div></div>';
    }
    if (o.type === 'number') {
      return '<div class="field">' + lab + '<input id="' + id + '" type="number" data-field="' + k + '" value="' + esc(v) + '" placeholder="' + esc(o.ph || '') + '" /></div>';
    }
    return '<div class="field">' + lab + '<input id="' + id + '" type="' + (o.type || 'text') + '" data-field="' + k + '" value="' + esc(v) + '" placeholder="' + esc(o.ph || '') + '" /></div>';
  };
  ui.fields = function (list) { return list.map(ui.field).join(''); };
  ui.grid = function (list, cols) { return '<div class="grid c' + (cols || 2) + '">' + list.map(ui.field).join('') + '</div>'; };

  ui.readForm = function (root) {
    var out = {};
    root.querySelectorAll('[data-field]').forEach(function (el) {
      var k = el.getAttribute('data-field');
      if (el.type === 'checkbox') out[k] = el.checked;
      else if (el.type === 'number') out[k] = MCW.parseInt0(el.value);
      else out[k] = el.value;
    });
    return out;
  };
  ui.pickerHTML = function (kind, selected, opts) {
    opts = opts || {};
    selected = selected || [];
    var rows = DB.list(kind);
    if (!rows.length) return '<div class="drop-hint">Nessun ' + esc(KIND_LABEL[kind].toLowerCase()) + ' ancora creato.</div>';
    var body = rows.map(function (r) {
      var name = r.name || r.title || 'Senza nome';
      var extra = r.alias ? ' «' + r.alias + '»' : (r.category ? ' · ' + r.category : (r.role ? ' · ' + r.role : ''));
      return '<label class="chk" data-pk="' + esc((name + extra).toLowerCase()) + '"><input type="checkbox" value="' + r.id + '"' +
        (selected.indexOf(r.id) >= 0 ? ' checked' : '') + ' /> ' + esc(name) + '<span class="muted xsmall">' + esc(extra) + '</span></label>';
    }).join('');
    return '<div class="picker" data-picker="' + kind + '">' +
      '<input type="text" class="pk-search" placeholder="' + esc(opts.ph || ('Filtra ' + kind + '…')) + '" data-pk-search="1" />' +
      '<div class="pk-list" style="max-height:190px;overflow:auto;display:flex;flex-wrap:wrap;gap:6px;margin-top:8px">' + body + '</div>' +
      '<div class="row tight" style="margin-top:6px"><button type="button" class="btn sm ghost" data-pk-all="1">Tutti</button><button type="button" class="btn sm ghost" data-pk-none="1">Nessuno</button></div>' +
      '</div>';
  };
  ui.readPicker = function (root, kind) {
    var box = root.querySelector('[data-picker="' + kind + '"]');
    if (!box) return null;
    return Array.from(box.querySelectorAll('input[type=checkbox]')).filter(function (c) { return c.checked; }).map(function (c) { return c.value; });
  };
  ui.bindForm = function (root, opts) {
    opts = opts || {};
    root.querySelectorAll('[data-picker]').forEach(function (pk) {
      var s = pk.querySelector('[data-pk-search]');
      if (s) s.oninput = function () {
        var q = s.value.toLowerCase();
        pk.querySelectorAll('[data-pk]').forEach(function (l) {
          l.style.display = (!q || l.getAttribute('data-pk').indexOf(q) >= 0) ? '' : 'none';
        });
      };
      var all = pk.querySelector('[data-pk-all]'), none = pk.querySelector('[data-pk-none]');
      if (all) all.onclick = function () { pk.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.checked = true; }); };
      if (none) none.onclick = function () { pk.querySelectorAll('input[type=checkbox]').forEach(function (c) { c.checked = false; }); };
    });
    root.querySelectorAll('.img-pick').forEach(function (wrap) {
      var file = wrap.querySelector('input[type=file]'), hidden = wrap.querySelector('input[type=hidden]'), prev = wrap.querySelector('.prev');
      var pick = wrap.querySelector('[data-img="pick"]'), clear = wrap.querySelector('[data-img="clear"]');
      if (pick) pick.onclick = function () { file.click(); };
      if (file) file.onchange = function () {
        var f = file.files && file.files[0]; if (!f) return;
        MCW.toast('Ottimizzo l\'immagine…');
        ui.compressImage(f, 900).then(function (dataUrl) {
          hidden.value = dataUrl;
          prev.innerHTML = '<img src="' + dataUrl + '" style="width:100%;height:100%;object-fit:cover;border-radius:9px" />';
          if (opts.onImage) opts.onImage(hidden.value);
        }).catch(function () { MCW.toast('Impossibile leggere l\'immagine', 'err'); });
      };
      if (clear) clear.onclick = function () {
        hidden.value = ''; prev.innerHTML = '🖼️';
        if (file) file.value = '';
        if (opts.onImage) opts.onImage('');
      };
    });
  };
  ui.compressImage = function (file, maxW) {
    return new Promise(function (resolve, reject) {
      var fr = new FileReader();
      fr.onerror = reject;
      fr.onload = function () {
        var img = new Image();
        img.onerror = function () { resolve(fr.result); };
        img.onload = function () {
          try {
            var scale = Math.min(1, (maxW || 900) / img.width);
            var w = Math.round(img.width * scale), h = Math.round(img.height * scale);
            var c = document.createElement('canvas'); c.width = w; c.height = h;
            c.getContext('2d').drawImage(img, 0, 0, w, h);
            resolve(c.toDataURL('image/jpeg', 0.82));
          } catch (e) { resolve(fr.result); }
        };
        img.src = fr.result;
      };
      fr.readAsDataURL(file);
    });
  };

  /* ------------------------------------------------------------------ cards */
  ui.openCard = function (kind, id) {
    var rec = DB.get(kind, id);
    if (!rec) { MCW.toast('Elemento non trovato', 'warn'); return; }
    var body = '', title = rec.name || rec.title || KIND_LABEL[kind];
    if (kind === 'characters') {
      var pres = MCW.presenceOf(id);
      body = '<div class="row" style="align-items:flex-start;gap:14px;margin-bottom:14px">' + ui.avatar(rec, 'lg') +
        '<div><h3 style="margin:0 0 4px">' + esc(rec.name) + (rec.alias ? ' <span class="muted" style="font-size:14px">«' + esc(rec.alias) + '»</span>' : '') + '</h3>' +
        '<div class="row tight">' + (rec.alignment ? '<span class="pill ' + MCW.alignClass(rec.alignment) + '">' + esc(rec.alignment) + '</span>' : '') +
        ui.rolePill(rec.role) + ui.presencePill(rec.importance) +
        (rec.faction ? '<span class="pill">' + esc(rec.faction) + '</span>' : '') + '</div></div></div>' +
        ui.textKv('Personalità', rec.personality) + ui.textKv('Aspetto', rec.appearance) +
        '<div class="grid c2">' + ui.textKv('Specie', rec.species) + ui.textKv('Età', rec.age) + '</div>' +
        ui.textKv('Abilità', rec.abilities) + ui.textKv('Poteri', rec.powers) +
        '<div class="presence-box" style="margin:12px 0">' +
        '<div class="pb"><div class="k">Capitoli</div><div class="v">' + pres.chapters.length + '</div></div>' +
        '<div class="pb"><div class="k">Scene</div><div class="v">' + pres.sceneCount + '</div></div>' +
        '<div class="pb"><div class="k">Eventi</div><div class="v">' + pres.eventCount + '</div></div>' +
        '<div class="pb"><div class="k">Parole</div><div class="v">' + nf(pres.words) + '</div></div></div>' +
        (rec.quotes ? '<div class="field"><label class="f">Frasi caratteristiche</label><div style="font-style:italic">' + esc(rec.quotes).replace(/\n/g, '<br>') + '</div></div>' : '');
    } else if (kind === 'locations') {
      body = (rec.image ? '<img src="' + esc(rec.image) + '" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:12px" />' : '') +
        '<div class="row tight" style="margin-bottom:12px">' + ui.pill(rec.category) + '</div>' +
        ui.textKv('Descrizione', rec.description) + ui.textKv('Posizione', rec.position) + ui.textKv('Abitanti', rec.inhabitants) +
        ui.textKv('Fazione', rec.faction) +
        ui.kv('Personaggi collegati', ui.chips('characters', rec.characterIds));
    } else if (kind === 'events') {
      var ch = rec.chapterId ? DB.get('chapters', rec.chapterId) : null;
      body = (rec.description ? '<p>' + esc(rec.description) + '</p>' : '') +
        '<div class="row tight" style="margin-bottom:10px">' + (ch ? ui.chip('chapters', ch.id, false) : '') +
        (rec.narrativeDate ? '<span class="pill">🗓️ ' + esc(rec.narrativeDate) + '</span>' : '') +
        (rec.milestone ? '<span class="pill amb">★ Pietra miliare</span>' : '') + '</div>' +
        ui.kv('Luogo', rec.locationId ? ui.chip('locations', rec.locationId, false) : '<span class="muted small">—</span>') +
        ui.kv('Personaggi coinvolti', ui.chips('characters', rec.characterIds)) +
        ui.textKv('Conseguenze', rec.consequences);
    } else if (kind === 'objects') {
      body = (rec.image ? '<img src="' + esc(rec.image) + '" style="width:100%;max-height:200px;object-fit:cover;border-radius:10px;margin-bottom:12px" />' : '') +
        '<div class="row tight" style="margin-bottom:12px">' + ui.pill(rec.category) + '</div>' +
        ui.textKv('Descrizione', rec.description) + ui.textKv('Poteri', rec.powers) + ui.textKv('Origine', rec.origin) +
        ui.kv('Proprietari', ui.chips('characters', rec.ownerIds));
    } else if (kind === 'notes') {
      body = '<div class="row tight" style="margin-bottom:10px"><span class="pill amb">' + esc(rec.tag || 'NOTA') + '</span>' +
        '<span class="pill ' + (rec.status === 'risolta' ? 'good' : '') + '">' + esc(rec.status === 'risolta' ? 'risolta' : 'aperta') + '</span></div>' +
        '<p style="white-space:pre-wrap">' + esc(rec.text) + '</p>' + ui.kv('Capitolo', rec.chapterId ? ui.chip('chapters', rec.chapterId, false) : '');
    } else if (kind === 'ideas') {
      body = '<div class="row tight" style="margin-bottom:10px">' + ui.pill(rec.category) +
        '<span class="pill ' + (rec.status === 'sviluppata' ? 'good' : 'amb') + '">' + esc(rec.status || 'aperta') + '</span></div>' +
        '<p style="white-space:pre-wrap">' + esc(rec.text) + '</p>';
    } else {
      body = '<p class="muted">' + esc(MCW.excerpt(rec.text || rec.description || '', 400)) + '</p>';
    }
    MCW.openModal({
      title: title, icon: KIND_ICON[kind],
      body: body,
      footer: '<button class="btn ghost" data-m="close">Chiudi</button>' +
        '<button class="btn primary" data-m="goto" data-kind="' + kind + '" data-id="' + id + '">Apri scheda completa ↗</button>',
      after: function (wrap) {
        wrap.querySelector('[data-m="goto"]').onclick = function () {
          MCW.closeAllModals();
          ui.go(ui.routeFor(kind, id));
        };
      }
    });
  };

  ui.go = function (hash) { global.location.hash = hash; };

  ui.confirmDelete = function (kind, id, label) {
    var rec = DB.get(kind, id);
    if (!rec) return;
    MCW.confirmDialog('Eliminare definitivamente «' + (label || rec.name || rec.title || 'elemento') + '»?', {
      title: 'Elimina ' + KIND_LABEL[kind], danger: true, ok: 'Elimina',
      detail: kind === 'chapters' ? 'Verranno eliminate anche le sezioni e le scene contenute.' :
        kind === 'characters' ? 'Verranno rimosse le sue relazioni e i suoi collegamenti a scene, eventi e luoghi.' : ''
    }).then(function (ok) {
      if (!ok) return;
      var name = rec.name || rec.title || '';
      DB.remove(kind, id);
      MCW.toast('«' + name + '» eliminato');
      if (ui.go && MCW.currentRoute && MCW.currentRoute.name === kind) ui.go('#/' + kind);
    });
  };

  /* ============================================================== DASHBOARD */
  MCW.views.dashboard = {
    render: function () {
      var t = MCW.totals(), p = DB.project();
      var chapters = MCW.chaptersSorted();
      var recent = DB.list('chapters').slice().sort(function (a, b) { return new Date(b.updatedAt) - new Date(a.updatedAt); }).slice(0, 3);
      var todos = MCW.todoList();
      var openNotes = DB.list('notes').filter(function (n) { return n.status !== 'risolta'; });
      var openIdeas = DB.list('ideas').filter(function (i) { return i.status !== 'sviluppata'; });
      var evNoCons = DB.list('events').filter(function (e) { return !MCW.stripNotes(e.consequences); });
      var chNoArc = DB.list('characters').filter(function (c) { var a = c.arc || {}; return !MCW.stripNotes(a.inizio + a.sviluppo + a.svolta + a.evoluzione); });
      var lastUpd = [p.updatedAt].concat(DB.list('chapters').map(function (c) { return c.updatedAt; })).filter(Boolean).sort().pop();
      var empty = !chapters.length && !t.characters && !t.locations;

      var h = '<div class="hero"><div class="hero-bg"></div><div class="hero-in">' +
        '<div class="hero-kicker">La mia serie</div>' +
        '<h1 class="hero-title">' + esc(p.name || 'La mia serie Minecraft') + '</h1>' +
        '<div class="hero-sub">' + (p.author ? 'di ' + esc(p.author) + ' · ' : '') +
          t.chapters + ' capitoli · ' + t.characters + ' personaggi · ' + t.locations + ' luoghi · ' + MCW.nf(t.words) + ' parole' +
          (lastUpd ? ' · ultima modifica ' + MCW.humanDate(lastUpd) : '') + '</div>' +
        '<div class="hero-actions">' +
          '<button class="btn primary" data-act="new-chapter">+ Nuovo capitolo</button>' +
          '<button class="btn" data-go="#/writing">✍️ Continua a scrivere</button>' +
          '<button class="btn ghost" data-go="#/reading">📖 Modalità lettura</button>' +
          '<button class="btn ghost" data-act="quick-idea">💡 Idea veloce</button>' +
        '</div></div></div>';

      if (empty) {
        h += '<div class="empty"><span class="big">⛏️</span><strong>Il tuo progetto è vuoto</strong>' +
          '<p class="small">Crea il primo capitolo, oppure carica il progetto demo dalle impostazioni.</p>' +
          '<div class="row tight center"><button class="btn primary" data-act="new-chapter">Crea il primo capitolo</button>' +
          '<button class="btn" data-act="seed-demo">Carica progetto demo</button></div></div>';
      }

      h += '<div class="section-title">Scorciatoie</div><div class="quick-grid">' +
        quick('#/writing', '✍️', 'Scrivi', 'Editor con contesto rapido') +
        quick('#/chapters', '📚', 'Capitoli', 'Struttura e stati') +
        quick('#/characters', '👥', 'Personaggi', 'Scheda, arco, relazioni') +
        quick('#/timeline', '🕐', 'Timeline', 'Eventi in ordine') +
        quick('#/locations', '🌍', 'Luoghi', 'Mondo della serie') +
        quick('#/ideas', '💡', 'Idee', 'Da trasformare in scene') +
        '</div>';

      h += '<div class="section-title">Numeri della serie</div><div class="stat-grid">' +
        uistat('📚', 'Capitoli', t.chapters, t.sections + ' sezioni · ' + t.scenes + ' scene') +
        uistat('👥', 'Personaggi', t.characters, ((t.byGroup || {}).protagonists || 0) + ' protagonisti · ' + ((t.byGroup || {}).antagonists || 0) + ' antagonisti') +
        uistat('🌍', 'Luoghi', t.locations, t.objects + ' oggetti') +
        uistat('⚔️', 'Eventi', t.events, t.ideas + ' idee · ' + t.notes + ' note aperte') +
        uistat('✍️', 'Parole', MCW.nf(t.words), 'in ' + t.scenes + ' scene') +
        uistat('🕐', 'Ultima modifica', '', lastUpd ? MCW.humanDate(lastUpd) : '—') +
        '</div>';

      h += '<div class="section-title">Composizione del cast</div><div class="card">' +
        '<div class="row" style="align-items:flex-start;gap:22px">' +
        '<div style="flex:1 1 260px;min-width:220px"><div class="barlist">' +
        bar('⭐ Protagonisti', ((t.byGroup || {}).protagonists || 0), '#/characters', 'protagonists') +
        bar('☠️ Antagonisti', ((t.byGroup || {}).antagonists || 0), '#/characters', 'antagonists') +
        bar('👥 Secondari', t.byGroup.secondary, '#/characters', 'secondary') +
        bar('👤 Altri', t.byGroup.others, '#/characters', 'others') +
        '</div></div>' +
        '<div style="flex:1 1 240px;min-width:200px"><div class="barlist">' +
        Object.keys(t.byAlign || {}).map(function (a) {
          return bar(a, t.byAlign[a], '#/characters', 'align', a);
        }).join('') +
        '</div></div></div>' +
        '<div class="xsmall muted" style="margin-top:11px">Schieramento e ruolo narrativo restano due classificazioni separate: un personaggio può essere Buono e Protagonista, Ambiguo e Ricorrente, ecc.</div>' +
        '</div>';

      h += '<div class="section-title">Continua a scrivere</div>';
      if (!recent.length) h += '<div class="empty small">Nessun capitolo ancora. Inizia da <strong>+ Nuovo capitolo</strong>.</div>';
      else h += '<div class="list">' + recent.map(function (c) {
        var st = MCW.chapterStats(c.id);
        return '<div class="continue-card" data-go="#/writing/chapter/' + c.id + '">' +
          '<div class="avatar sm">' + esc(c.number || '?') + '</div>' +
          '<div style="flex:1;min-width:0"><div class="row tight"><strong>' + esc(c.title || 'Senza titolo') + '</strong>' + ui.statusPill(c.status) + '</div>' +
          '<div class="small muted">' + st.sections + ' sezioni · ' + st.scenes + ' scene · ' + MCW.nf(st.words) + ' parole · modificato ' + ui.updDate(c) + '</div></div>' +
          '<span class="btn sm">Scrivi →</span></div>';
      }).join('') + '</div>';

      h += '<div class="section-title">Da sistemare</div>';
      h += '<div class="stat-grid" style="margin-bottom:13px">' +
        uistat('📝', 'Note aperte', openNotes.length, openIdeas.length ? openIdeas.length + ' idee da sviluppare' : 'idee tutte sviluppate') +
        uistat('💡', 'Idee non sviluppate', openIdeas.length, 'nella sezione Idee') +
        uistat('⚔️', 'Eventi senza conseguenze', evNoCons.length, 'da completare') +
        uistat('👤', 'Personaggi senza arco', chNoArc.length, 'arco narrativo vuoto') +
        '</div>';
      if (!todos.length) h += '<div class="empty small">✨ Niente in sospeso.</div>';
      else h += '<div class="list">' + todos.slice(0, 6).map(function (td) {
        return '<div class="todo-item" data-go="' + (td.route || td.go || '#/notes') + '"><span class="tico">' + (td.icon || '•') + '</span>' +
          '<div style="flex:1;min-width:0"><div class="small"><strong>' + esc((td.kind || td.type || 'Voce')) + '</strong> · ' + esc((td.title || td.label || '')) + '</div>' +
          '<div class="xsmall muted">' + esc(MCW.excerpt((td.text || td.subtitle || ''), 110)) + '</div></div><span class="xsmall muted">apri ↗</span></div>';
      }).join('') + '</div>' +
        (todos.length > 6 ? '<div class="row tight" style="margin-top:10px"><button class="btn sm ghost" data-go="#/notes">Vedi tutte le ' + todos.length + ' voci in sospeso →</button></div>' : '');
      return { html: h };
    }
  };
  function uistat(icon, k, v, x) {
    return '<div class="stat"><span class="si">' + esc(icon) + '</span>' +
      (v === '' || v === null || v === undefined ? '' : '<span class="sv">' + esc(String(v)) + '</span>') +
      '<span class="sk">' + esc(k) + '</span>' + (x ? '<span class="sx">' + esc(String(x)) + '</span>' : '') + '</div>';
  }
  function quick(route, icon, title, sub) {
    return '<div class="quick" data-go="' + route + '"><span class="qi">' + icon + '</span><span class="qt">' + esc(title) + '</span><span class="qs">' + esc(sub) + '</span></div>';
  }
  function bar(label, value, route, group, align) {
    var pct = Math.max(3, Math.min(100, value * 100 / 12));
    return '<div class="barrow" data-bar-group="' + group + '"' + (align ? ' data-bar-align="' + esc(align) + '"' : '') + '>' +
      '<span class="bl">' + esc(label) + '</span><span class="bt"><i style="width:' + pct + '%"></i></span><span class="bv">' + value + '</span></div>';
  }
  function stat(icon, k, v, x) {
    return '<div class="stat"><div class="k">' + icon + ' ' + esc(k) + '</div>' +
      (v === '' ? '<div class="v" style="font-size:17px">' + esc(x) + '</div>' : '<div class="v">' + (typeof v === 'number' ? nf(v) : esc(v)) + '</div><div class="x">' + esc(x || '') + '</div>') + '</div>';
  }

  /* =============================================================== CAPITOLI */
  var chapterFilter = { season: 'all', status: 'all', q: '' };

  MCW.views.chapters = {
    render: function (p) {
      if (p && p.id) return MCW.views.chapterDetail.render(p);
      var chapters = MCW.chaptersSorted();
      var seasons = DB.list('seasons').slice().sort(function (a, b) { return (a.number || 0) - (b.number || 0); });
      var list = chapters.filter(function (c) {
        if (chapterFilter.season !== 'all') {
          if (chapterFilter.season === 'none' ? c.seasonId : c.seasonId !== chapterFilter.season) return false;
        }
        if (chapterFilter.status !== 'all' && c.status !== chapterFilter.status) return false;
        if (chapterFilter.q) {
          var q = chapterFilter.q.toLowerCase();
          if ((c.title || '').toLowerCase().indexOf(q) < 0 && (c.subtitle || '').toLowerCase().indexOf(q) < 0 &&
            (c.description || '').toLowerCase().indexOf(q) < 0) return false;
        }
        return true;
      });
      var h = '<div class="viewhead"><div><h1>📚 Capitoli</h1><div class="sub">' + chapters.length + ' capitoli · ' + nf(MCW.totalWords()) + ' parole totali</div></div>' +
        '<div class="spacer"></div><div class="row tight">' +
        '<button class="btn ghost" data-act="new-season">+ Stagione</button>' +
        '<button class="btn ghost" data-act="nav" data-route="reading" data-scope="full">📖 Leggi tutto</button>' +
        '<button class="btn primary" data-act="new-chapter">+ Nuovo capitolo</button>' +
        '</div></div>';

      h += '<div class="row tight" style="margin-bottom:14px">' +
        '<select id="chSeasonFilter" style="max-width:220px"><option value="all">Tutte le stagioni</option>' +
        seasons.map(function (s) { return '<option value="' + s.id + '"' + (chapterFilter.season === s.id ? ' selected' : '') + '>' + esc(s.title) + '</option>'; }).join('') +
        '<option value="none"' + (chapterFilter.season === 'none' ? ' selected' : '') + '>Senza stagione</option></select>' +
        '<select id="chStatusFilter" style="max-width:190px"><option value="all">Tutti gli stati</option>' +
        E.chapterStatus.map(function (s) { return '<option' + (chapterFilter.status === s ? ' selected' : '') + '>' + esc(s) + '</option>'; }).join('') + '</select>' +
        '<input type="text" id="chSearch" placeholder="Cerca capitolo…" style="max-width:240px" value="' + esc(chapterFilter.q) + '" />' +
        '</div>';

      if (seasons.length) {
        h += '<div class="section-title">Stagioni</div><div class="list">' + seasons.map(function (s) {
          var cs = chapters.filter(function (c) { return c.seasonId === s.id; });
          return '<div class="list-row"><span>🗓️</span><div style="flex:1;min-width:0">' +
            '<strong>' + esc(s.title) + '</strong> <span class="muted small">' + esc(s.subtitle || '') + '</span>' +
            '<div class="xsmall muted">' + cs.length + ' capitoli · ' + nf(cs.reduce(function (a, c) { return a + MCW.chapterWordCount(c.id); }, 0)) + ' parole</div></div>' +
            '<button class="btn sm ghost" data-act="edit-season" data-id="' + s.id + '">Modifica</button>' +
            '<button class="btn sm ghost" data-act="delete-entity" data-kind="seasons" data-id="' + s.id + '">Elimina</button>' +
            '</div>';
        }).join('') + '</div>';
      }

      h += '<div class="section-title">' + (list.length ? list.length + ' capitoli' : 'Capitoli') + '</div>';
      if (!list.length) h += '<div class="empty"><span class="big">📖</span>Nessun capitolo qui.' +
        '<div class="row tight center" style="justify-content:center;margin-top:10px"><button class="btn primary" data-act="new-chapter">+ Nuovo capitolo</button></div></div>';
      else h += '<div class="list" id="chapterList">' + list.map(function (c) {
        var st = MCW.chapterStats(c.id);
        return '<div class="list-row" data-drag-id="' + c.id + '">' +
          '<span class="grip" title="Trascina per riordinare">⠿</span>' +
          '<div class="avatar sm">' + esc(c.number || '?') + '</div>' +
          '<div style="flex:1;min-width:0" data-go="#/chapters/' + c.id + '">' +
          '<div class="row tight"><strong>' + esc(c.title || 'Senza titolo') + '</strong>' + ui.statusPill(c.status) + '</div>' +
          '<div class="xsmall muted">' + esc(MCW.excerpt(c.subtitle || c.description, 110)) + '</div>' +
          '<div class="xsmall muted">' + st.sections + ' sezioni · ' + st.scenes + ' scene · ' + nf(st.words) + ' parole · ' +
          st.characterIds.length + ' personaggi · ' + st.locationIds.length + ' luoghi · ultima modifica ' + ui.updDate(c) + '</div>' +
          '</div>' +
          '<div class="row tight">' +
          '<button class="icon-btn" title="Su" data-act="reorder" data-kind="chapters" data-id="' + c.id + '" data-dir="-1" style="width:32px;height:32px">▲</button>' +
          '<button class="icon-btn" title="Giù" data-act="reorder" data-kind="chapters" data-id="' + c.id + '" data-dir="1" style="width:32px;height:32px">▼</button>' +
          '<button class="icon-btn" title="Leggi" data-go="#/reading/chapter/' + c.id + '" style="width:32px;height:32px">📖</button>' +
          '<button class="icon-btn" title="Scrivi" data-go="#/writing/chapter/' + c.id + '" style="width:32px;height:32px">✍️</button>' +
          '<button class="icon-btn" title="Modifica" data-go="#/chapters/' + c.id + '" style="width:32px;height:32px">✏️</button>' +
          '<button class="icon-btn" title="Duplica" data-act="duplicate-chapter" data-id="' + c.id + '" style="width:32px;height:32px">⧉</button>' +
          '<button class="icon-btn" title="Elimina" data-act="delete-entity" data-kind="chapters" data-id="' + c.id + '" style="width:32px;height:32px">🗑️</button>' +
          '</div></div>';
      }).join('') + '</div>';

      return {
        html: h,
        mount: function (root) {
          var s = root.querySelector('#chSeasonFilter'); if (s) s.onchange = function () { chapterFilter.season = s.value; MCW.emit('filter'); };
          var st = root.querySelector('#chStatusFilter'); if (st) st.onchange = function () { chapterFilter.status = st.value; MCW.emit('filter'); };
          var q = root.querySelector('#chSearch');
          if (q) q.oninput = MCW.debounce(function () { chapterFilter.q = q.value; MCW.emit('filter'); }, 250);
          var listEl = root.querySelector('#chapterList');
          if (listEl) {
            var ordered = list.filter(function () { return true; });
            MCW.makeSortable(listEl, function (srcId, targetId) {
              var ids = list.map(function (c) { return c.id; });
              MCW.DB.moveToIndex('chapters', srcId, ids.indexOf(targetId), null);
              // rinumerazione progressiva
              MCW.chaptersSorted().forEach(function (c, i) { if ((c.number || 0) !== i + 1) MCW.DB.updateSilent('chapters', c.id, { number: i + 1 }); });
              MCW.emit('reorder');
            });
          }
        }
      };
    }
  };

  /* ------------------------------------------------- dettaglio capitolo */
  MCW.views.chapterDetail = {
    render: function (p) {
      var c = DB.get('chapters', p.id);
      if (!c) return { html: '<div class="empty">Capitolo non trovato. <button class="btn sm" data-go="#/chapters">Torna ai capitoli</button></div>' };
      var st = MCW.chapterStats(c.id);
      var secs = MCW.sectionsOf(c.id);
      var h = '<div class="viewhead">' +
        '<div><div class="xsmall muted"><span data-go="#/chapters" style="cursor:pointer">📚 Capitoli</span> / Capitolo ' + esc(c.number || '?') + '</div>' +
        '<h1>Cap. ' + esc(c.number || '?') + ' — ' + esc(c.title || 'Senza titolo') + '</h1>' +
        '<div class="sub">' + esc(c.subtitle || '') + '</div></div>' +
        '<div class="spacer"></div><div class="row tight">' +
        ui.statusPill(c.status) +
        '<button class="btn" data-go="#/reading/chapter/' + c.id + '">📖 Leggi</button>' +
        '<button class="btn primary" data-go="#/writing/chapter/' + c.id + '">✍️ Scrivi</button>' +
        '<button class="btn ghost" data-act="delete-entity" data-kind="chapters" data-id="' + c.id + '">🗑️</button>' +
        '</div></div>';

      h += '<div class="tabs" data-tabs="chdet">' +
        '<button class="tab active" data-tab="info">Dettagli</button>' +
        '<button class="tab" data-tab="struttura">Struttura</button>' +
        '<button class="tab" data-tab="presenze">Presenze</button>' +
        '</div>';

      h += '<div data-tabpane="info">' +
        '<div class="grid c2">' +
        ui.field({ k: 'number', label: 'Numero', type: 'number', value: c.number }) +
        ui.field({ k: 'title', label: 'Titolo', value: c.title }) +
        ui.field({ k: 'subtitle', label: 'Sottotitolo', value: c.subtitle }) +
        ui.field({ k: 'status', label: 'Stato', type: 'select', value: c.status, options: E.chapterStatus }) +
        '</div>' +
        ui.field({ k: 'seasonId', label: 'Stagione', type: 'select', value: c.seasonId || '', options: [{ value: '', label: '— nessuna —' }].concat(DB.list('seasons').map(function (s) { return { value: s.id, label: 'Stagione ' + (s.number || '') + ' — ' + s.title }; })) }) +
        ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 4, value: c.description }) +
        ui.field({ k: 'cover', label: 'Copertina (opzionale)', type: 'image', value: c.cover }) +
        ui.field({ k: 'authorNotes', label: 'Note dell\'autore', type: 'textarea', rows: 3, value: c.authorNotes, hint: 'Nascoste in modalità lettura.' }) +
        '<div class="row tight" style="margin:6px 0 14px">' +
        '<button class="btn primary" data-act="save-chapter" data-id="' + c.id + '">Salva dettagli</button>' +
        '<span class="small muted">Salvataggio automatico attivo: i campi si salvano anche senza premere.</span></div>' +
        '<div class="stat-grid">' +
        stat('📝', 'Parole', st.words, 'in questo capitolo') +
        stat('🧩', 'Sezioni', st.sections, st.scenes + ' scene') +
        stat('🕐', 'Creato', '', MCW.fmtDate(c.createdAt)) +
        stat('✏️', 'Ultima modifica', '', MCW.humanDate(c.updatedAt)) +
        '</div></div>';

      h += '<div data-tabpane="struttura" hidden>' +
        '<div class="row tight" style="margin-bottom:10px"><button class="btn primary sm" data-act="new-section" data-chapter="' + c.id + '">+ Nuova sezione</button>' +
        '<span class="small muted">Trascina o usa ▲▼ per riordinare.</span></div>';
      if (!secs.length) h += '<div class="empty small">Nessuna sezione. Crea la prima sezione narrativa.</div>';
      else h += '<div class="list" id="secList">' + secs.map(function (s) {
        var sc = MCW.scenesOf(s.id);
        return '<div class="list-row" data-drag-id="' + s.id + '"><span class="grip">⠿</span><div style="flex:1;min-width:0" data-go="#/writing/section/' + s.id + '">' +
          '<div class="row tight"><strong>' + esc(s.title || 'Sezione') + '</strong>' +
          '<span class="xsmall muted">' + nf(MCW.wordCount(s.text)) + ' parole</span></div>' +
          '<div class="xsmall muted">' + esc(MCW.excerpt(s.description, 100)) + '</div>' +
          '<div class="xsmall muted">' + sc.length + ' scene · ' + ((s.characterIds || []).length) + ' personaggi' + (s.locationId ? ' · ' + esc((DB.get('locations', s.locationId) || {}).name || '') : '') + '</div></div>' +
          '<div class="row tight">' +
          '<button class="icon-btn" style="width:32px;height:32px" title="Su" data-act="reorder" data-kind="sections" data-id="' + s.id + '" data-dir="-1">▲</button>' +
          '<button class="icon-btn" style="width:32px;height:32px" title="Giù" data-act="reorder" data-kind="sections" data-id="' + s.id + '" data-dir="1">▼</button>' +
          '<button class="icon-btn" style="width:32px;height:32px" title="Scrivi" data-go="#/writing/section/' + s.id + '">✍️</button>' +
          '<button class="icon-btn" style="width:32px;height:32px" title="Elimina" data-act="delete-entity" data-kind="sections" data-id="' + s.id + '">🗑️</button>' +
          '</div></div>';
      }).join('') + '</div></div>';

      h += '<div data-tabpane="presenze" hidden>' +
        ui.kv('Personaggi presenti (derivati da sezioni, scene ed eventi)', ui.chips('characters', st.characterIds, 'Nessuno collegato')) +
        '<div class="hr"></div>' +
        ui.kv('Luoghi presenti', ui.chips('locations', st.locationIds, 'Nessuno collegato')) +
        '<div class="hr"></div>' +
        '<div class="field"><label class="f">Eventi principali del capitolo</label>' +
        (st.events.length ? '<div class="list">' + st.events.map(function (e) {
          return '<div class="list-row" data-open="events" data-id="' + e.id + '"><span>⚔️</span><div style="flex:1"><strong>' + esc(e.title) + '</strong>' +
            '<div class="xsmall muted">' + esc(MCW.excerpt(e.description, 100)) + '</div></div></div>';
        }).join('') + '</div>' : '<span class="muted small">Nessun evento collegato.</span>') +
        '</div></div>';

      return {
        html: h,
        mount: function (root) {
          ui.bindForm(root);
          var cur = 'info';
          root.querySelectorAll('[data-tabs="chdet"] .tab').forEach(function (t) {
            t.onclick = function () {
              cur = t.getAttribute('data-tab');
              root.querySelectorAll('[data-tabs="chdet"] .tab').forEach(function (x) { x.classList.toggle('active', x === t); });
              root.querySelectorAll('[data-tabpane]').forEach(function (pn) { pn.hidden = pn.getAttribute('data-tabpane') !== cur; });
            };
          });
          // salvataggio automatico dei campi
          var timer = null;
          root.querySelectorAll('[data-tabpane="info"] [data-field]').forEach(function (el) {
            var ev = el.tagName === 'SELECT' || el.type === 'checkbox' ? 'change' : 'input';
            el.addEventListener(ev, function () {
              clearTimeout(timer);
              timer = setTimeout(function () {
                var f = ui.readForm(root.querySelector('[data-tabpane="info"]'));
                if (f.seasonId === 'none' || f.seasonId === '') f.seasonId = null;
                DB.updateSilent('chapters', c.id, f);
                MCW.flush();
              }, 500);
            });
          });
          var secList = root.querySelector('#secList');
          if (secList) MCW.makeSortable(secList, function (a, b) {
            var ids = MCW.sectionsOf(c.id).map(function (s) { return s.id; });
            DB.moveToIndex('sections', a, ids.indexOf(b), function (r) { return r.chapterId === c.id; });
            MCW.emit('reorder');
          });
        }
      };
    }
  };

  /* =============================================================== SCRITTURA */
  var writeUI = { tab: 'characters', showDetails: false, showLeft: null, showRight: null, fontSize: 1 };
  MCW._fontScale = MCW._fontScale || 1;

  function writingTarget(p) {
    if (p && p.kind && p.id) {
      var kind = p.kind === 'scene' ? 'scenes' : p.kind === 'chapter' ? 'chapters' : 'sections';
      var rec = DB.get(kind, p.id);
      if (rec) return { kind: kind, rec: rec };
    }
    try {
      var last = JSON.parse(global.localStorage.getItem('mcsw.lastWrite') || 'null');
      if (last && DB.get(last.kind, last.id)) return { kind: last.kind, rec: DB.get(last.kind, last.id) };
    } catch (e) {}
    var chs = MCW.chaptersSorted();
    for (var i = 0; i < chs.length; i++) {
      var ss = MCW.sectionsOf(chs[i].id);
      if (ss.length) return { kind: 'sections', rec: ss[0] };
      var scs = MCW.scenesOfChapter(chs[i].id);
      if (scs.length) return { kind: 'scenes', rec: scs[0] };
    }
    return null;
  }

  MCW.views.writing = {
    render: function (p) {
      var tgt = writingTarget(p);
      writeUI.current = tgt;
      var isMobile = global.innerWidth < 760;
      var showLeft = isMobile ? false : (writeUI.showLeft == null ? true : writeUI.showLeft);
      var showRight = isMobile ? false : (writeUI.showRight == null ? true : writeUI.showRight);
      var h = '<div class="writing' + (showLeft ? '' : ' hide-left') + (showRight ? '' : ' hide-right') + '" id="writingGrid">';
      h += '<div class="pane pane-left" id="paneLeft"><div class="pane-head">🧱 Struttura' +
        '<span class="spacer"></span><button class="cell-btn" style="width:28px;height:28px;flex:0 0 28px" data-act="toggle-pane" data-pane="left" title="Nascondi">✕</button></div>' +
        '<div class="pane-body">' + structureTreeHTML(tgt) +
        '<button class="btn ghost block sm" data-act="new-chapter" style="margin-top:10px">+ Nuovo capitolo</button></div></div>';
      h += '<div class="pane-center" style="min-width:0">';
      if (!tgt) {
        h += '<div class="empty"><span class="big">✍️</span><strong>Nessun testo da scrivere</strong>' +
          '<p class="small">Crea un capitolo, poi una sezione con le sue scene.</p>' +
          '<div class="row tight center"><button class="btn primary" data-act="new-chapter">+ Nuovo capitolo</button></div></div>';
      } else {
        h += editorHTML(tgt, showLeft, showRight);
      }
      h += '</div>';
      h += '<div class="pane pane-right" id="paneRight"><div class="pane-head">🧭 Contesto rapido' +
        '<span class="spacer"></span><button class="cell-btn" style="width:28px;height:28px;flex:0 0 28px" data-act="toggle-pane" data-pane="right" title="Nascondi">✕</button></div>' +
        '<div class="pane-body" id="ctxBody"></div></div>';
      h += '</div>';
      return { html: h, mount: function (root) { mountEditor(root, tgt); } };
    }
  };

  function structureTreeHTML(tgt) {
    var chapters = MCW.chaptersSorted();
    if (!chapters.length) return '<div class="muted small">Nessun capitolo.</div>';
    var h = '<div class="tree">';
    chapters.forEach(function (c) {
      var secs = MCW.sectionsOf(c.id);
      h += '<div class="t-chapter"><div class="t-title"><strong>Cap. ' + esc(c.number || '?') + '</strong> ' + esc(c.title || '') +
        '<span class="spacer" style="flex:1"></span>' +
        '<button class="icon-btn" style="width:24px;height:24px;font-size:12px" title="Aggiungi sezione" data-act="new-section" data-chapter="' + c.id + '">＋</button></div>' +
        '<div class="t-items">';
      if (!secs.length) h += '<div class="xsmall muted" style="padding:4px 8px">nessuna sezione</div>';
      secs.forEach(function (s) {
        var active = tgt && tgt.rec.id === s.id;
        h += '<div class="t-item' + (active ? ' active' : '') + '" data-go="#/writing/section/' + s.id + '">' +
          '<span data-act="reorder-inline" data-kind="sections" data-id="' + s.id + '" data-dir="-1" style="opacity:.5">▲</span>' + esc(s.title || 'Sezione') +
          '<span style="flex:1"></span>' +
          '<span class="xsmall muted">' + nf(MCW.wordCount(s.text)) + 'p</span>' +
          '<span data-act="new-scene" data-section="' + s.id + '" style="opacity:.7" title="Aggiungi scena">＋</span></div>';
        MCW.scenesOf(s.id).forEach(function (sc) {
          var act2 = tgt && tgt.rec.id === sc.id;
          h += '<div class="t-item' + (act2 ? ' active' : '') + '" data-go="#/writing/scene/' + sc.id + '" style="margin-left:10px">🎬 ' + esc(sc.title || 'Scena') +
            '<span style="flex:1"></span><span class="xsmall muted">' + nf(MCW.wordCount(sc.text)) + 'p</span></div>';
        });
      });
      h += '</div></div>';
    });
    return h + '</div>';
  }

  function editorHTML(tgt, showLeft, showRight) {
    var rec = tgt.rec, kind = tgt.kind;
    var isScene = kind === 'scenes';
    var ch = isScene ? MCW.chapterOfScene(rec) : MCW.chapterOfSection(rec);
    var sec = isScene ? MCW.sectionOfScene(rec) : null;
    var isMobile = global.innerWidth < 760;
    var crumbs = '<span class="crumb" data-go="#/chapters/' + (ch ? ch.id : '') + '">Cap. ' + esc(ch ? (ch.number || '?') : '?') + '</span>' +
      (sec ? '<span class="csep">/</span><span class="crumb" data-go="#/writing/section/' + sec.id + '">' + esc(sec.title || 'Sezione') + '</span>' : '') +
      '<span class="csep">/</span><span class="crumb on">' + (isScene ? '🎬 Scena' : '🧩 Sezione') + '</span>';
    var tools = ['<button data-cmd="bold" title="Grassetto (Ctrl+B)"><b>B</b></button>',
      '<button data-cmd="italic" title="Corsivo (Ctrl+I)"><i>I</i></button>',
      '<button data-cmd="underline" title="Sottolineato"><u>U</u></button>',
      '<span class="sep"></span>',
      '<button data-cmd="h1" title="Titolo">H1</button>',
      '<button data-cmd="h2" title="Sottotitolo">H2</button>',
      '<button data-cmd="h3" title="Titolo minore">H3</button>',
      '<button data-cmd="p" title="Paragrafo">¶</button>',
      '<span class="sep"></span>',
      '<button data-cmd="ul" title="Elenco puntato">• Elenco</button>',
      '<button data-cmd="ol" title="Elenco numerato">1. Elenco</button>',
      '<button data-cmd="quote" title="Citazione">❝</button>',
      '<button data-cmd="hr" title="Separatore">—</button>',
      '<span class="sep"></span>',
      '<button data-cmd="dialogue" title="Blocco dialogo">💬 Dialogo</button>',
      '<button data-cmd="note" title="Nota autore (nascosta in lettura)">📝 Nota</button>',
      '<button data-cmd="image" title="Inserisci immagine">🖼️</button>',
      '<span class="sep"></span>',
      '<button data-cmd="removeFormat" title="Rimuovi formattazione">⌫ fmt</button>',
      '<button data-cmd="undo" title="Annulla">↶</button>',
      '<button data-cmd="redo" title="Ripeti">↷</button>'].join('');
    var asOpts = MCW.AUTOSAVE_CHOICES.map(function (o) {
      return '<option value="' + o.ms + '"' + (o.ms === MCW.autosaveMs() ? ' selected' : '') + '>' + esc(o.label) + '</option>';
    }).join('');
    var h = '<div class="editor-wrap">' +
      '<div class="editor-meta">' +
        '<div class="meta-top">' +
          (isMobile ? '<button class="cell-btn" data-act="open-structure" title="Struttura della storia">🧱</button>'
                    : '<button class="cell-btn" data-act="toggle-pane" data-pane="left" title="Mostra/nascondi struttura">' + (showLeft ? '◀' : '☰') + '</button>') +
          '<div class="meta-title">' +
            '<div class="crumbs">' + crumbs + '</div>' +
            '<input class="title-in" data-eltitle="1" value="' + esc(rec.title || '') + '" placeholder="Titolo ' + (isScene ? 'scena' : 'sezione') + '" />' +
            '<div class="meta-sub" data-metasub="1">' + (isScene ? '🎬 Scena' : '🧩 Sezione') + ' · <span data-wordcount-meta="1">' + MCW.nf(MCW.wordCount(rec.text)) + '</span> parole · modificato ' + MCW.humanDate(rec.updatedAt) + '</div>' +
          '</div>' +
          (isMobile ? '<button class="cell-btn" data-act="open-context" title="Contesto rapido">🧭</button>'
                    : '<button class="cell-btn" data-act="toggle-pane" data-pane="right" title="Mostra/nascondi strumenti">' + (showRight ? '▶' : '🧭') + '</button>') +
        '</div>' +
        '<div class="toolbar">' + tools + '<input type="file" accept="image/*" hidden id="edImgFile" /></div>' +
      '</div>' +
      '<div class="editor" id="editor" contenteditable="true" spellcheck="true" autocorrect="on" autocapitalize="sentences">' + (rec.text || '') + '</div>' +
      '<div class="editor-foot">' +
        '<span class="foot-stat" data-wordcount="1">' + MCW.nf(MCW.wordCount(rec.text)) + ' parole</span>' +
        '<span class="foot-stat hide-sm" data-charcount="1">' + MCW.stripNotes(rec.text).length + ' caratteri</span>' +
        '<span class="spacer"></span>' +
        '<span class="autosave-mini" title="Intervallo di salvataggio automatico"><span>💾</span><select id="asInterval">' + asOpts + '</select></span>' +
        '<button class="btn sm primary" data-act="save-editor" id="edSaveBtn">Salva ora</button>' +
        '<span class="save-chip saved" id="edStatus" data-status="saved">✓ Salvato</span>' +
      '</div>' +
    '</div>';
    return h;
  }

  function mountEditor(root, tgt) {
    var editor = root.querySelector('#editor');
    if (!editor || !tgt) return;
    var kind = tgt.kind, rec = tgt.rec;
    var timer = null, titleTimer = null, dirty = false, mode = MCW.autosaveMs();
    var statusEl = root.querySelector('#edStatus');
    var saveBtn = root.querySelector('#edSaveBtn');

    function setLocal(st, txt) {
      if (!statusEl) return;
      statusEl.className = 'save-chip ' + st;
      statusEl.setAttribute('data-status', st);
      statusEl.textContent = txt;
    }
    function counts() {
      var html = editor.innerHTML;
      var n = MCW.wordCount(html);
      root.querySelectorAll('[data-wordcount],[data-wordcount-meta]').forEach(function (el) { el.textContent = MCW.nf(n); });
      var cc = root.querySelector('[data-charcount]');
      if (cc) cc.textContent = MCW.stripNotes(html).length + ' caratteri';
      var tree = root.querySelector('.pane-left');
      if (tree) {
        tree.querySelectorAll('[data-go="#/writing/' + (kind === 'scenes' ? 'scene' : 'section') + '/' + rec.id + '"] .xsmall.muted').forEach(function (el) {
          el.textContent = MCW.nf(n) + 'p';
        });
      }
    }
    function persist() {
      clearTimeout(timer);
      DB.updateSilent(kind, rec.id, { text: editor.innerHTML });
      dirty = false;
      MCW.flush();
      setLocal('saved', '✓ Salvato');
      counts();
    }
    function scheduleSave(now) {
      clearTimeout(timer); timer = null;
      clearTimeout(timer);
      dirty = true;
      setLocal('dirty', '● Non salvato');
      if (now) { persist(); return; }
      if (mode > 0) timer = setTimeout(persist, mode);
    }
    function flushPending() { if (dirty) persist(); }

    editor.addEventListener('input', function () { scheduleSave(false); counts(); });
    editor.addEventListener('paste', function (e) {
      if (!e.clipboardData) return;
      var text = e.clipboardData.getData('text/plain');
      if (!text) return;
      e.preventDefault();
      var html = text.split(/\n{2,}/).map(function (par) { return '<p>' + esc(par).replace(/\n/g, '<br>') + '</p>'; }).join('');
      try { document.execCommand('insertHTML', false, html); } catch (err) {}
      scheduleSave(false); counts();
    });
    editor.addEventListener('focus', function () { MCW._editing = true; });
    editor.addEventListener('blur', function () { MCW._editing = false; if (dirty && mode === 0) setLocal('dirty', '● Non salvato'); });
    editor.addEventListener('keyup', recordCaret);
    editor.addEventListener('mouseup', recordCaret);

    var caretRange = null;
    function recordCaret() {
      var sel = global.getSelection();
      if (sel && sel.rangeCount && editor.contains(sel.anchorNode)) caretRange = sel.getRangeAt(0).cloneRange();
    }
    MCW._restoreCaret = function () {
      if (!caretRange) return;
      try { editor.focus(); var sel = global.getSelection(); sel.removeAllRanges(); sel.addRange(caretRange); } catch (e) {}
    };
    MCW._editorSave = function () { flushPending(); };
    MCW._beforeRender.push(flushPending);

    var ti = root.querySelector('[data-eltitle]');
    if (ti) ti.addEventListener('input', function () {
      clearTimeout(titleTimer);
      titleTimer = setTimeout(function () { DB.updateSilent(kind, rec.id, { title: ti.value }); MCW.flush(); }, Math.max(600, mode || 1200));
    });

    function command(cmd) {
      try {
        if (cmd === 'bold' || cmd === 'italic' || cmd === 'underline' || cmd === 'removeFormat' || cmd === 'undo' || cmd === 'redo') {
          document.execCommand(cmd, false, null);
        } else if (cmd === 'ul') document.execCommand('insertUnorderedList', false, null);
        else if (cmd === 'ol') document.execCommand('insertOrderedList', false, null);
        else if (cmd === 'h1' || cmd === 'h2' || cmd === 'h3') document.execCommand('formatBlock', false, cmd.toUpperCase());
        else if (cmd === 'p') document.execCommand('formatBlock', false, 'P');
        else if (cmd === 'quote') document.execCommand('formatBlock', false, 'BLOCKQUOTE');
        else if (cmd === 'hr') document.execCommand('insertHTML', false, '<hr><p><br></p>');
        else if (cmd === 'dialogue') document.execCommand('insertHTML', false, '<div class="dialogue"><span class="who">Personaggio:</span> «Frase di dialogo»</div><p><br></p>');
        else if (cmd === 'note') document.execCommand('insertHTML', false, '<div class="note">Nota dell\'autore…</div><p><br></p>');
        else if (cmd === 'image') { var f = root.querySelector('#edImgFile'); if (f) f.click(); return; }
      } catch (e) { MCW.toast('Comando non supportato', 'warn'); }
    }
    root.querySelectorAll('.toolbar [data-cmd]').forEach(function (b) {
      b.onmousedown = function (e) { e.preventDefault(); };
      b.onclick = function () {
        editor.focus();
        MCW._restoreCaret();
        command(b.getAttribute('data-cmd'));
        recordCaret();
        scheduleSave(false);
        counts();
      };
    });
    var imgFile = root.querySelector('#edImgFile');
    if (imgFile) imgFile.onchange = function () {
      var f = imgFile.files && imgFile.files[0]; if (!f) return;
      MCW.toast('Ottimizzo l\'immagine…');
      ui.compressImage(f, 1100).then(function (d) {
        editor.focus();
        try { MCW._restoreCaret(); document.execCommand('insertHTML', false, '<img src="' + d + '" alt="" /><p><br></p>'); }
        catch (e) { editor.innerHTML += '<img src="' + d + '" />'; }
        scheduleSave(true); counts(); imgFile.value = ''; MCW.toast('Immagine inserita ✓');
      });
    };
    editor.addEventListener('keydown', function (e) {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 's') { e.preventDefault(); scheduleSave(true); MCW.toast('Salvato ✓'); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'b') { e.preventDefault(); document.execCommand('bold'); scheduleSave(false); }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'i') { e.preventDefault(); document.execCommand('italic'); scheduleSave(false); }
    });
    if (saveBtn) saveBtn.onclick = function () { scheduleSave(true); MCW.toast('Salvato ✓'); };
    if (statusEl) statusEl.onclick = function () { if (dirty) scheduleSave(true); };
    var asSel = root.querySelector('#asInterval');
    if (asSel) asSel.onchange = function () {
      mode = MCW.parseInt0(asSel.value);
      MCW.setAutosave(mode);
      root.querySelectorAll('#asInterval').forEach(function (s2) { s2.value = String(mode); });
      MCW.toast(mode > 0 ? 'Salvataggio automatico: ogni ' + (mode / 1000) + 's' : 'Salvataggio automatico disattivato: usa «Salva ora»');
      clearTimeout(timer); timer = null;
      if (mode > 0 && dirty) scheduleSave(false);
    };
    // permette alle Impostazioni di cambiare l'intervallo SENZA ricostruire l'editor
    MCW._editorSetInterval = function (ms) {
      mode = MCW.parseInt0(ms);
      clearTimeout(timer); timer = null;
      var s = root.querySelector('#asInterval'); if (s) s.value = String(mode);
      if (mode > 0 && dirty) scheduleSave(false);
    };
    counts();

    // pulsanti "scheda" (binding diretto, non dipende da main.js)
    root.querySelectorAll('[data-act="open-structure"]').forEach(function (b) {
      b.onclick = function (e) { e.preventDefault(); MCW.openStructureSheet(); };
    });
    root.querySelectorAll('[data-act="open-context"]').forEach(function (b) {
      b.onclick = function (e) { e.preventDefault(); MCW.openContextSheet(); };
    });
    root.querySelectorAll('[data-act="toggle-pane"]').forEach(function (b) {
      b.onclick = function (e) {
        e.preventDefault();
        var w = b.getAttribute('data-pane');
        if (w === 'left') writeUI.showLeft = (writeUI.showLeft === false);
        else writeUI.showRight = (writeUI.showRight === false);
        MCW.emit('ui');
      };
    });

    // pannello contesto (solo desktop: su mobile è una scheda)
    var ctx = root.querySelector('#ctxBody');
    if (ctx) {
      ctx.innerHTML = '<div id="ctxInner">' + contextBlockHTML(tgt) + '</div>';
      bindContextBlock(root.querySelector('#ctxInner'), tgt);
    }
    try { global.localStorage.setItem('mcsw.lastWrite', JSON.stringify({ kind: tgt.kind, id: tgt.rec.id })); } catch (e) {}
  }

  function contextPaneHTML(tgt) { return contextBlockHTML(tgt); }

  function contextBlockHTML(tgt) {
    var tabs = [['characters', '👥 Personaggi'], ['locations', '🌍 Luoghi'], ['events', '⚔️ Eventi'], ['objects', '🧱 Oggetti'], ['notes', '📝 Note'], ['mentions', '🔍 Nel testo']];
    var h = '<div class="tabs" style="margin-bottom:9px">' + tabs.map(function (t) {
      return '<button class="tab' + (writeUI.tab === t[0] ? ' active' : '') + '" data-ctx="' + t[0] + '" style="padding:6px 9px;font-size:12.5px">' + t[1] + '</button>';
    }).join('') + '</div>';
    h += '<input type="text" id="ctxFilter" placeholder="Filtra…" style="margin-bottom:9px" />';
    h += '<div id="ctxList">' + ctxListHTML(tgt) + '</div>';
    h += '<div class="hr"></div><div class="section-title" style="margin-top:8px">🧩 Dettagli ' + (tgt && tgt.kind === 'scenes' ? 'scena' : 'sezione') + '</div>' +
      '<button class="btn sm block ghost" data-act="open-details">Apri dettagli narrativi</button>';
    h += '<div class="hr"></div><div class="section-title" style="margin-top:8px">📝 Nota rapida</div>' +
      '<textarea id="quickNote" rows="3" placeholder="[DA CONTROLLARE] …"></textarea>' +
      '<button class="btn sm primary block" id="quickNoteSave" style="margin-top:7px">Aggiungi nota</button>';
    return h;
  }

  function ctxListHTML(tgt) {
    var kind = writeUI.tab;
    var linked = [];
    if (tgt) {
      var rec = tgt.rec;
      if (kind === 'characters') linked = rec.characterIds || [];
      if (kind === 'locations') linked = rec.locationId ? [rec.locationId] : [];
    }
    if (kind === 'mentions') {
      var text = MCW.stripNotes(tgt ? tgt.rec.text : '');
      var found = DB.list('characters').filter(function (c) { return c.name && text.toLowerCase().indexOf(c.name.toLowerCase()) >= 0; });
      var foundL = DB.list('locations').filter(function (l) { return l.name && text.toLowerCase().indexOf(l.name.toLowerCase()) >= 0; });
      if (!found.length && !foundL.length) return '<div class="small muted">Nessun nome riconosciuto nel testo di questa scena. Scrivi il nome di un personaggio per vederlo comparire qui.</div>';
      return '<div class="xsmall muted" style="margin-bottom:7px">Toccando un nome si apre la scheda senza chiudere la scrittura.</div>' +
        '<div class="row tight">' + found.map(function (c) { return ui.chip('characters', c.id); }).join('') +
        foundL.map(function (l) { return ui.chip('locations', l.id); }).join('') + '</div>';
    }
    var rows = DB.list(kind);
    if (!rows.length) return '<div class="small muted">Nessun elemento in questo archivio.</div>';
    return '<div class="list">' + rows.map(function (r) {
      var name = r.name || r.title || '—';
      var on = linked.indexOf(r.id) >= 0;
      return '<div class="list-row" style="padding:8px 10px">' +
        (kind === 'characters' ? ui.avatar(r, 'sm') : '<span>' + KIND_ICON[kind] + '</span>') +
        '<div style="flex:1;min-width:0" data-open="' + kind + '" data-id="' + r.id + '">' +
        '<div class="small"><strong>' + esc(name) + '</strong></div>' +
        '<div class="xsmall muted">' + esc(r.alias || r.category || r.role || r.tag || (r.narrativeDate || '') || MCW.excerpt(r.text || r.description, 60)) + '</div></div>' +
        (tgt ? '<button class="cell-btn' + (on ? ' is-off' : '') + '" style="width:32px;height:32px;flex:0 0 32px;font-size:14px" data-link="' + (on ? 'rm' : 'add') + '" data-kind="' + kind + '" data-id="' + r.id + '" title="' + (on ? 'Rimuovi collegamento' : 'Collega a questa scena') + '">' + (on ? '✓' : '＋') + '</button>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function bindContextBlock(root, tgt) {
    if (!root) return;
    function rebind() {
      var box = root.querySelector('#ctxList');
      if (!box) return;
      box.querySelectorAll('[data-link]').forEach(function (b) {
        b.onclick = function (e) {
          e.stopPropagation();
          if (!tgt) return;
          var k = b.getAttribute('data-kind'), id = b.getAttribute('data-id'), mode2 = b.getAttribute('data-link');
          var rec = tgt.rec;
          if (k === 'locations') DB.update(tgt.kind, rec.id, { locationId: mode2 === 'rm' ? null : id });
          else {
            var cur = (rec.characterIds || []).slice();
            if (mode2 === 'rm') cur = cur.filter(function (x) { return x !== id; });
            else if (cur.indexOf(id) < 0) cur.push(id);
            DB.update(tgt.kind, rec.id, { characterIds: cur });
          }
          MCW.toast(mode2 === 'rm' ? 'Collegamento rimosso' : 'Collegato ✓');
          box.innerHTML = ctxListHTML(tgt);
          rebind();
        };
      });
      var filterEl = root.querySelector('#ctxFilter');
      if (filterEl) filterEl.oninput = function () {
        var q = filterEl.value.toLowerCase();
        box.querySelectorAll('.list-row').forEach(function (r) {
          r.style.display = (!q || r.textContent.toLowerCase().indexOf(q) >= 0) ? '' : 'none';
        });
      };
    }
    root.querySelectorAll('[data-ctx]').forEach(function (b) {
      b.onclick = function () {
        writeUI.tab = b.getAttribute('data-ctx');
        root.querySelectorAll('[data-ctx]').forEach(function (x) { x.classList.toggle('active', x === b); });
        var box = root.querySelector('#ctxList');
        if (box) { box.innerHTML = ctxListHTML(tgt); rebind(); }
      };
    });
    rebind();
    var det = root.querySelector('[data-act="open-details"]');
    if (det) det.onclick = function () { openDetailsModal(tgt); };
    var qs = root.querySelector('#quickNoteSave');
    if (qs) qs.onclick = function () {
      var v2 = root.querySelector('#quickNote').value.trim();
      if (!v2) return;
      var tag = (v2.match(/^\[([^\]]+)\]/) || [])[1] || 'ALTRO';
      var up = tag.toUpperCase();
      if (E.noteTag.indexOf(up) < 0) up = 'ALTRO';
      DB.create('notes', { text: v2, tag: up, status: 'aperta', chapterId: tgt.rec.chapterId || null,
        sectionId: tgt.kind === 'sections' ? tgt.rec.id : (tgt.rec.sectionId || null),
        sceneId: tgt.kind === 'scenes' ? tgt.rec.id : null });
      root.querySelector('#quickNote').value = '';
      MCW.toast('Nota salvata in «Da sistemare» ✓');
      MCW.emit('quick-note');
    };
  }

  MCW.openStructureSheet = function () {
    var tgt = writeUI.current;
    MCW.openModal({
      title: 'Struttura della storia', icon: '🧱', size: 'xl',
      body: '<div id="sheetTree">' + structureTreeHTML(tgt) + '</div>' +
        '<div class="row tight" style="margin-top:12px"><button class="btn sm ghost" data-act="new-chapter">+ Nuovo capitolo</button>' +
        '<button class="btn sm ghost" data-act="new-section" data-chapter="' + ((tgt && tgt.rec.chapterId) || '') + '">+ Sezione nel capitolo corrente</button></div>',
      footer: '<button class="btn ghost" data-m="close">Chiudi</button>',
      after: function (wrap) {
        wrap.addEventListener('click', function (e) {
          var t = e.target.closest('[data-go],[data-act="new-chapter"],[data-act="new-section"]');
          if (t && !t.closest('.modal-foot')) setTimeout(MCW.closeAllModals, 60);
        });
      }
    });
  };
  MCW.openContextSheet = function () {
    var tgt = writeUI.current;
    if (!tgt) { MCW.toast('Apri prima una scena o una sezione', 'warn'); return; }
    MCW.openModal({
      title: 'Contesto rapido', icon: '🧭', size: 'xl',
      body: '<div id="sheetCtx">' + contextBlockHTML(tgt) + '</div>',
      footer: '<button class="btn ghost" data-m="close">Chiudi</button>',
      after: function (wrap) { bindContextBlock(wrap.querySelector('#sheetCtx'), tgt); }
    });
  };

  function openDetailsModal(tgt) {
    var kind = tgt.kind, rec = tgt.rec;
    var body = ui.field({ k: 'title', label: 'Titolo', value: rec.title }) +
      ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 3, value: rec.description }) +
      (kind === 'sections'
        ? ui.field({ k: 'objective', label: 'Obiettivo', type: 'textarea', rows: 2, value: rec.objective }) +
        ui.field({ k: 'conflict', label: 'Conflitto', type: 'textarea', rows: 2, value: rec.conflict }) +
        ui.field({ k: 'consequence', label: 'Conseguenza', type: 'textarea', rows: 2, value: rec.consequence })
        : '') +
      ui.field({ k: 'notes', label: 'Note tecniche (nascoste in lettura)', type: 'textarea', rows: 2, value: rec.notes }) +
      '<label class="f">Luogo</label>' +
      '<select data-field="locationId"><option value="">— nessuno —</option>' +
      DB.list('locations').map(function (l) { return '<option value="' + l.id + '"' + (rec.locationId === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select>' +
      '<div class="field" style="margin-top:12px"><label class="f">Personaggi presenti</label>' + ui.pickerHTML('characters', rec.characterIds || []) + '</div>';
    MCW.openModal({
      title: 'Dettagli ' + (kind === 'scenes' ? 'scena' : 'sezione'), icon: '🧩', body: body,
      footer: '<button class="btn ghost" data-m="close">Chiudi</button><button class="btn primary" data-m="save">Salva</button>',
      after: function (wrap) {
        ui.bindForm(wrap);
        wrap.querySelector('[data-m="save"]').onclick = function () {
          var f = ui.readForm(wrap);
          f.characterIds = ui.readPicker(wrap, 'characters') || [];
          if (!f.locationId) f.locationId = null;
          DB.update(kind, rec.id, f);
          MCW.closeModal();
          MCW.toast('Dettagli salvati');
          MCW.emit('details');
        };
      }
    });
  }

  /* ============================================================ LETTURA */
  function readingSequence(scope) {
    var chapters = MCW.chaptersSorted();
    if (scope && scope.kind === 'chapter' && scope.id) chapters = chapters.filter(function (c) { return c.id === scope.id; });
    var total = [];
    chapters.forEach(function (c) {
      var secs = MCW.sectionsOf(c.id);
      if (scope && scope.kind === 'section' && scope.id) secs = secs.filter(function (s) { return s.id === scope.id; });
      var orphan = MCW.scenesOfChapter(c.id).filter(function (sc) { return !secs.some(function (s) { return s.id === sc.sectionId; }); });
      var flat = [];
      secs.forEach(function (s) {
        var scenes = MCW.scenesOf(s.id);
        if (scope && scope.kind === 'scene' && scope.id) scenes = scenes.filter(function (x) { return x.id === scope.id; });
        flat.push({ type: 'section', rec: s, scenes: scenes });
      });
      if (orphan.length && !(scope && scope.kind === 'scene')) flat.push({ type: 'section', rec: null, scenes: orphan });
      total.push({ chapter: c, blocks: flat });
    });
    return total;
  }

  /* Testo a livello di capitolo: l'editor può salvare qui (modalità Idea/Scrittura
     senza sezioni). La Lettura deve mostrarlo come le sezioni e le scene. */
  function chapterBody(c) {
    if (!c) return '';
    var raw = c.text || c.content || c.story || c.body || '';
    if (!raw) return '';
    var out = raw;
    try { if (MCW.stripNotesForReading) out = MCW.stripNotesForReading(raw) || raw; } catch (e) {}
    try { if (!String(out).replace(/<[^>]*>/g, '').trim()) return ''; } catch (e) {}
    return out;
  }
  MCW.chapterBody = chapterBody;

  MCW.views.reading = {
    render: function (p) {
      var scope = null;
      if (p && p.kind && p.id) {
        if (p.kind === 'chapter') scope = { kind: 'chapter', id: p.id };
        if (p.kind === 'section') scope = { kind: 'section', id: p.id };
        if (p.kind === 'scene') scope = { kind: 'scene', id: p.id };
      }
      var seq = readingSequence(scope);
      var totalWords = 0;
      var h = '<div class="viewhead"><div><h1>📖 Modalità lettura</h1>' +
        '<div class="sub">Solo la storia: note, info tecniche e riferimenti sono nascosti.</div></div><div class="spacer"></div>' +
        '<div class="row tight">' +
        '<select id="readScope" style="max-width:260px">' +
        '<option value="full"' + (!scope ? ' selected' : '') + '>Intero progetto</option>' +
        MCW.chaptersSorted().map(function (c) {
          return '<option value="chapter:' + c.id + '"' + (scope && scope.kind === 'chapter' && scope.id === c.id ? ' selected' : '') + '>Cap. ' + (c.number || '?') + ' — ' + esc(c.title) + '</option>' +
            MCW.sectionsOf(c.id).map(function (s) {
              return '<option value="section:' + s.id + '"' + (scope && scope.kind === 'section' && scope.id === s.id ? ' selected' : '') + '>   ↳ ' + esc(s.title) + '</option>' +
                MCW.scenesOf(s.id).map(function (sc) {
                  return '<option value="scene:' + sc.id + '"' + (scope && scope.kind === 'scene' && scope.id === sc.id ? ' selected' : '') + '>        · ' + esc(sc.title) + '</option>';
                }).join('');
            }).join('');
        }).join('') +
        '</select>' +
        '<button class="icon-btn" data-act="read-font" data-dir="-1" title="Testo più piccolo">A-</button>' +
        '<button class="icon-btn" data-act="read-font" data-dir="1" title="Testo più grande">A+</button>' +
        '<button class="icon-btn" data-act="print" title="Stampa / PDF">🖨️</button>' +
        '</div></div>';

      h += '<div class="reading" id="readingBody" style="font-size:' + (18.5 * (MCW._fontScale || 1)).toFixed(1) + 'px">';
      var any = false;
      seq.forEach(function (blk, bi) {
        var c = blk.chapter;
        h += '<div class="r-chapter">Capitolo ' + esc(c.number || '?') + '</div><h1>' + esc(c.title || '') + '</h1>';
        if (c.subtitle) h += '<p class="center muted" style="text-align:center;font-family:var(--font);font-size:14px;margin-top:-24px;margin-bottom:30px">' + esc(c.subtitle) + '</p>';
        var cbody = chapterBody(c);
        if (cbody) { any = true; h += '<div class="chapter-body">' + cbody + '</div>'; totalWords += MCW.wordCount(c.text || ''); }
        blk.blocks.forEach(function (b) {
          var s = b.rec;
          if (s) {
            any = true;
            h += '<h2>' + esc(s.title || '') + '</h2>';
            if (s.description) h += '<p class="center muted" style="text-align:center;font-family:var(--font);font-size:14px">' + esc(s.description) + '</p>';
            var stext = (MCW.stripNotesForReading ? MCW.stripNotesForReading(s.text) : s.text);
            if (stext) h += stext;
            totalWords += MCW.wordCount(s.text);
          }
          b.scenes.forEach(function (sc) {
            any = true;
            h += '<div class="r-scene-title">' + esc(sc.title || '') + '</div>';
            var sctext = (MCW.stripNotesForReading ? MCW.stripNotesForReading(sc.text) : sc.text);
            h += sctext || '<p class="muted small">(scena ancora da scrivere)</p>';
            totalWords += MCW.wordCount(sc.text);
          });
        });
      });
      if (!any) h += '<div class="empty"><span class="big">📖</span>Non c\'è ancora nulla da leggere.<div style="margin-top:10px"><button class="btn primary" data-act="new-chapter">+ Nuovo capitolo</button></div></div>';
      h += '</div>';

      if (any) h += '<div class="reading-nav"><button class="btn" data-act="read-nav" data-dir="-1">← Precedente</button>' +
        '<button class="btn ghost" data-go="#/chapters">Indice</button>' +
        '<button class="btn" data-act="read-nav" data-dir="1">Successivo →</button></div>';

      return {
        html: h,
        mount: function (root) {
          var sel = root.querySelector('#readScope');
          if (sel) sel.onchange = function () {
            var v = sel.value;
            if (v === 'full') MCW.emit('go:#/reading');
            else { var parts = v.split(':'); MCW.emit('go:#/reading/' + parts[0] + '/' + parts[1]); }
          };
          var body = root.querySelector('#readingBody');
          if (body && (scope && scope.kind === 'scene')) body.scrollIntoView({ block: 'start' });
        }
      };
    }
  };

  /* ----------------------------------------------------- filtri/utility UI */
  /* ============================================================ IMPOSTAZIONI */
  MCW.views.settings = {
    render: function () {
      var p = DB.project(), t = MCW.totals();
      var snaps = DB.list('snapshots').slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      var asOpts = MCW.AUTOSAVE_CHOICES.map(function (o) {
        return '<option value="' + o.ms + '"' + (o.ms === MCW.autosaveMs() ? ' selected' : '') + '>' + esc(o.label) + '</option>';
      }).join('');
      var h = '<div class="viewhead"><div><h1>⚙️ Impostazioni</h1><div class="sub">Salvataggio, progetto, backup, versioni e installazione sul telefono.</div></div></div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">🎨 Aspetto</div>' +
        '<div class="swatches">' + MCW.THEMES.map(function (t) {
          return '<button class="swatch' + (t.id === MCW.theme() ? ' active' : '') + '" data-theme-pick="' + t.id + '">' +
            '<i style="background:' + t.c + '"></i>' + esc(t.label) + '</button>';
        }).join('') + '</div>' +
        '<div class="xsmall muted" style="margin-top:9px">Il colore si applica subito e resta memorizzato su questo dispositivo. Il viola è il tema predefinito.</div></div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">💾 Salvataggio</div>' +
        '<div class="grid c2"><div class="field"><label class="f">Salvataggio automatico ogni…</label>' +
        '<select id="setAs" data-noact="1">' + asOpts + '</select>' +
        '<div class="xsmall muted" style="margin-top:6px">Con «Solo manuale» nulla viene salvato finché non premi <strong>Salva ora</strong>. Il testo non salvato è indicato con <strong>● Non salvato</strong>.</div></div>' +
        '<div class="field"><label class="f">Stato attuale</label>' +
        '<div class="row tight"><button class="btn primary" data-act="save-now">💾 Salva ora tutto</button>' +
        '<span class="save-chip ' + (MCW._lastStatus || 'saved') + '" data-savestatus="1">' + (MCW._lastStatusText || '✓ Salvato') + '</span></div>' +
        '<div class="xsmall muted" style="margin-top:6px">Anche con il salvataggio automatico attivo, le scritture su IndexedDB non ricostruiscono mai l\'editor: puoi continuare a scrivere mentre salva.</div></div></div>' +
        '<div class="hint">Scrivi con calma: il testo viene memorizzato <strong>sul tuo dispositivo</strong> (IndexedDB, con fallback su localStorage). Nessun dato viene inviato a un server.</div></div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">Progetto</div>' +
        ui.field({ k: 'name', label: 'Nome della serie', value: p.name }) +
        ui.field({ k: 'author', label: 'Autore', value: p.author }) +
        ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 3, value: p.description }) +
        '<label class="chk"><input type="checkbox" data-field="autoBackup"' + (p.settings.autoBackup ? ' checked' : '') + ' /> Backup automatico (snapshot ogni 5 minuti di attività)</label>' +
        '<div class="xsmall muted" style="margin-top:10px">Persistenza in uso: <strong>' + (DB.mode === 'indexeddb' ? 'IndexedDB' : 'localStorage (fallback)') + '</strong>' +
        (DB.lastSavedAt ? ' · ultimo salvataggio ' + MCW.fmtTime(DB.lastSavedAt) : '') + '</div></div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">Backup e trasferimento</div>' +
        '<div class="row tight"><button class="btn primary" data-act="export-json">⬇️ Esporta progetto (JSON)</button>' +
        '<button class="btn" data-act="import-json">⬆️ Importa progetto</button>' +
        '<button class="btn ghost" data-act="import-merge">⇄ Unisci un backup</button></div>' +
        '<p class="small muted" style="margin-top:11px">Il file JSON contiene tutto: personaggi, capitoli, sezioni, scene, testo, luoghi, eventi, oggetti, timeline, idee, note, relazioni e impostazioni. Usalo per il backup o per trasferire il progetto su un altro telefono o PC.</p>' +
        '<div class="stat-grid">' + stat('📚', 'Capitoli', t.chapters, '') + stat('👥', 'Personaggi', t.characters, '') +
        stat('🌍', 'Luoghi', t.locations, '') + stat('⚔️', 'Eventi', t.events, '') +
        stat('✍️', 'Parole', MCW.nf(t.words), '') + '</div></div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">Versioni (snapshot)</div>' +
        '<div class="row tight" style="margin-bottom:11px"><button class="btn primary sm" data-act="snapshot-create">+ Crea versione</button>' +
        '<span class="small muted">Restano nel browser: puoi tornare indietro a una versione precedente.</span></div>';
      if (!snaps.length) h += '<div class="small muted">Nessuna versione salvata.</div>';
      else h += snaps.map(function (s) {
        return '<div class="snap-row"><span>' + (s.auto ? '🤖' : '📌') + '</span><div style="flex:1;min-width:0">' +
          '<div class="small"><strong>' + esc(s.name) + '</strong></div>' +
          '<div class="xsmall muted">' + MCW.humanDate(s.createdAt) + ' · ' + (s.counts ? (s.counts.chapters + ' capitoli · ' + s.counts.characters + ' personaggi · ' + MCW.nf(s.counts.words) + ' parole') : '') + '</div></div>' +
          '<button class="btn sm" data-act="snapshot-restore" data-id="' + s.id + '">Ripristina</button>' +
          '<button class="btn sm ghost" data-act="delete-entity" data-kind="snapshots" data-id="' + s.id + '">🗑️</button></div>';
      }).join('') + '</div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">📲 App sul telefono (PWA)</div>' +
        '<p class="small">L\'app funziona interamente nel browser: nessun server, nessuna installazione di Python o Node.</p>' +
        '<div class="row tight"><button class="btn primary" data-act="install-pwa" id="pwaBtn">📲 Installa sul dispositivo</button>' +
        '<span class="small muted" id="pwaState">—</span></div>' +
        '<div class="warn-box" style="margin-top:11px">Su <strong>Android/Chrome</strong>: menu ⋮ → «Aggiungi a schermata Home» o «Installa app». Su <strong>iOS/Safari</strong>: Condividi → «Aggiungi a schermata Home».</div></div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">🌐 Dove vive l\'app</div>' +
        '<p class="small">Questa app è un insieme di file statici. Puoi tenerla su un indirizzo pubblico (come ora) oppure copiarla nel tuo spazio gratuito GitHub Pages: in entrambi i casi <strong>i tuoi dati restano nel browser del tuo telefono</strong> e non vengono mai caricati online.</p>' +
        '<div class="hint">Se cambi indirizzo, i dati restano quelli del telefono solo se l\'indirizzo è lo stesso <em>oppure</em> se usi <strong>Esporta progetto</strong> su un indirizzo e <strong>Importa progetto</strong> sull\'altro.</div></div>';

      h += '<div class="card settings-card"><div class="section-title" style="margin-top:0">Zona pericolosa</div>' +
        '<div class="row tight"><button class="btn" data-act="seed-demo">🔄 Ricarica progetto demo</button>' +
        '<button class="btn danger" data-act="wipe-all">🗑️ Cancella tutti i dati</button></div>' +
        '<p class="small muted" style="margin-top:11px">Prima di cancellare, esporta un backup JSON.</p></div>';

      return {
        html: h,
        mount: function (root) {
          ui.bindForm(root);
          var asSel2 = root.querySelector('#setAs');
          if (asSel2) {
            asSel2.onclick = function (e) { e.stopPropagation(); };
            asSel2.onchange = function (e) {
              e.stopPropagation();
              var ms = MCW.parseInt0(asSel2.value);
              MCW.setAutosave(ms);
              if (MCW._editorSetInterval) MCW._editorSetInterval(ms);
              asSel2.value = String(MCW.autosaveMs());
              MCW.toast(ms > 0 ? 'Salvataggio automatico: ogni ' + (ms / 1000) + ' secondi' : 'Salvataggio automatico disattivato: usa «Salva ora»');
            };
          }
          var sBtn = root.querySelector('[data-act="save-now"]');
          if (sBtn) sBtn.onclick = function (e) { e.preventDefault(); MCW.saveNow().then(function () { MCW.toast('Tutto salvato ✓'); }); };

          // aspetto: scelta del colore, applicata subito e ricordata sul dispositivo
          root.querySelectorAll('[data-theme-pick]').forEach(function (b) {
            b.onclick = function (e) {
              e.preventDefault(); e.stopPropagation();
              MCW.setTheme(b.getAttribute('data-theme-pick'));
              root.querySelectorAll('[data-theme-pick]').forEach(function (x) { x.classList.toggle('active', x === b); });
              MCW.toast('Tema applicato: ' + b.getAttribute('data-theme-pick'));
            };
          });

          // campi del progetto: salvataggio immediato senza ricostruire la pagina
          root.querySelectorAll('[data-field="name"],[data-field="author"],[data-field="description"]').forEach(function (el) {
            el.addEventListener('change', function () {
              var f = {}; f[el.getAttribute('data-field')] = el.value;
              DB.setProject(f); MCW.toast('Salvato ✓');
            });
          });

          root.querySelectorAll('[data-field]').forEach(function (el) {
            el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', MCW.debounce(function () {
              var f = ui.readForm(root);
              DB.setProject({ name: f.name, author: f.author, description: f.description });
              var s = Object.assign({}, DB.project().settings);
              if ('autoBackup' in f) s.autoBackup = !!f.autoBackup;
              DB.setProject({ settings: s });
              MCW.flush();
            }, 500));
          });
        }
      };
    }
  };

  /* azioni che appartengono alla scrittura (registrate in main.js) */
  (MCW._lateActions = MCW._lateActions || []).push(
    ['save-editor', function (root) { if (MCW._editorSave) MCW._editorSave(); }],
    ['open-structure', function () { MCW.openStructureSheet(); }],
    ['open-context', function () { MCW.openContextSheet(); }],
    ['toggle-pane', function (root, el) {
      var which = el.getAttribute('data-pane');
      if (which === 'left') writeUI.showLeft = (writeUI.showLeft === false); else writeUI.showRight = (writeUI.showRight === false);
      MCW.emit('ui');
    }],
    ['noop', function () {}]
  );
})(typeof globalThis !== 'undefined' ? globalThis : this);
