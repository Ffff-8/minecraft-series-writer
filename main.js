/* ==========================================================================
   main.js — router hash, delegazione eventi, azioni globali, boot, PWA
   ========================================================================== */
(function (global) {
  'use strict';
  var MCW = global.MCW; if (!MCW) return;
  var DB = MCW.DB, esc = MCW.esc, E = MCW.ENUM, ui = MCW.ui;

  var NAV = [
    { route: 'dashboard', icon: '🏠', label: 'Dashboard' },
    { route: 'writing', icon: '✍️', label: 'Scrittura' },
    { route: 'chapters', icon: '📚', label: 'Capitoli' },
    { route: 'characters', icon: '👥', label: 'Personaggi' },
    { route: 'locations', icon: '🌍', label: 'Luoghi' },
    { route: 'events', icon: '⚔️', label: 'Eventi' },
    { route: 'objects', icon: '🧩', label: 'Oggetti' },
    { route: 'timeline', icon: '🕐', label: 'Timeline' },
    { route: 'ideas', icon: '💡', label: 'Idee' },
    { route: 'separator' },
    { route: 'search', icon: '🔎', label: 'Ricerca' },
    { route: 'reading', icon: '📖', label: 'Modalità lettura' },
    { route: 'notes', icon: '📝', label: 'Da sistemare' },
    { route: 'settings', icon: '⚙️', label: 'Impostazioni' }
  ];

  var VIEW_MAP = {
    dashboard: 'dashboard', writing: 'writing', chapters: 'chapters', characters: 'characters',
    locations: 'locations', events: 'events', objects: 'objects', timeline: 'timeline',
    ideas: 'ideas', notes: 'notes', search: 'search', reading: 'reading', settings: 'settings',
    graph: 'graph', season: 'chapters'
  };

  MCW.currentRoute = { name: 'dashboard', params: {} };
  MCW._beforeRender = [];

  /* --------------------------------------------------------------- routing */
  function parseHash() {
    var raw = (global.location.hash || '#/dashboard').replace(/^#\/?/, '');
    var parts = raw.split('/').filter(function (s) { return s.length; });
    if (!parts.length) return { name: 'dashboard', params: {} };
    var name = parts[0];
    var params = {};
    if (name === 'writing' || name === 'reading') {
      if (parts[1] && parts[2]) { params.kind = parts[1]; params.id = parts[2]; }
    } else if (name === 'search') {
      params.q = parts.slice(1).join('/');
    } else if (parts[1]) {
      params.id = parts[1];
    }
    return { name: name, params: params };
  }
  MCW.parseHash = parseHash;

  var viewEl, navEl, scrim, sidebar;

  function renderNav() {
    var t = MCW.totals();
    var counts = {
      chapters: t.chapters, characters: t.characters, locations: t.locations, events: t.events,
      objects: t.objects, ideas: t.ideas, notes: MCW.todoList().length
    };
    navEl.innerHTML = NAV.map(function (n) {
      if (n.route === 'separator') return '<div class="nav-sep"></div>';
      var active = MCW.currentRoute.name === n.route ? ' active' : '';
      var badge = counts[n.route] ? '<span class="nbadge">' + counts[n.route] + '</span>' : '';
      return '<button class="nav-item' + active + '" data-act="nav" data-route="' + n.route + '">' +
        '<span class="nico">' + n.icon + '</span><span>' + esc(n.label) + '</span>' + badge + '</button>';
    }).join('');
  }

  function renderProjectTitle() {
    var p = DB.project(), t = MCW.totals();
    var el = document.getElementById('projTitle');
    if (!el) return;
    el.innerHTML = '<span class="pt-name">' + esc(p.name || 'La mia serie') + '</span>' +
      '<span class="pt-meta">' + t.chapters + ' capitoli · ' + t.characters + ' personaggi · ' + MCW.nf(t.words) + ' parole</span>';
  }

  /* --------------------------------------------------------- scroll helpers */
  var SCROLL_SEL = '.pane-body, .view, .modal-body, .list, .tree, [data-scroll]';
  var prevRouteKey = null;

  function scrollSnapshot() {
    var s = { win: (global.pageYOffset || document.documentElement.scrollTop || 0), nodes: [] };
    Array.prototype.forEach.call(document.querySelectorAll(SCROLL_SEL), function (el) { s.nodes.push(el.scrollTop); });
    return s;
  }
  function scrollRestore(s) {
    if (!s) return;
    try {
      var cur = global.pageYOffset || document.documentElement.scrollTop || 0;
      if (Math.abs(cur - s.win) > 1) global.scrollTo(0, s.win);
    } catch (e) {}
    Array.prototype.forEach.call(document.querySelectorAll(SCROLL_SEL), function (el, i) {
      if (s.nodes[i] !== undefined && el.scrollTop !== s.nodes[i]) el.scrollTop = s.nodes[i];
    });
  }

  /* L'editor in scrittura e' una ZONA PROTETTA: nessun render lo sostituisce */
  function editorProtected() {
    if (MCW._editing) return true;
    var r = MCW.currentRoute || {};
    if (r.name !== 'writing') return false;
    var ed = document.getElementById('editor');
    if (!ed) return false;
    var ae = document.activeElement;
    return !!(ae && (ae === ed || ed.contains(ae)));
  }
  MCW.editorProtected = editorProtected;

  /* Rimozione MIRATA: toglie solo il nodo dell'elemento eliminato, senza rerender */
  MCW.removeDeletedNode = function (kind, id) {
    if (!viewEl || !id) return false;
    var did = false;
    var hit = viewEl.querySelectorAll('[data-id="' + id + '"], [data-act="delete-entity"][data-id="' + id + '"]');
    Array.prototype.forEach.call(hit, function (n) {
      var card = n.closest('.card, .list-row, .t-item, .chapter-card, .todo-item, .stat, li, tr') || n;
      if (card && card.parentNode) { card.parentNode.removeChild(card); did = true; }
    });
    return did;
  };

  function render(refreshNav) {
    // 1) salva il testo eventualmente ancora in memoria dell'editor
    MCW._beforeRender.slice().forEach(function (f) { try { f(); } catch (e) {} });
    MCW._beforeRender = [];

    var route = parseHash();
    var routeKey = route.name + '|' + JSON.stringify(route.params || {});

    // PROTEZIONE: se l'utente sta scrivendo nello stesso editor, non si ricostruisce nulla
    if (route.name === 'writing' && routeKey === prevRouteKey && editorProtected()) {
      MCW.currentRoute = route;
      MCW._renderPending = true;
      if (refreshNav !== false) { renderNav(); renderProjectTitle(); }
      return;
    }

    MCW._renderPending = false;
    MCW.currentRoute = route;
    var vname = VIEW_MAP[route.name] || 'dashboard';
    var mod = MCW.views;
    var view = typeof mod[vname] === 'function' ? { render: mod[vname] } : mod[vname];
    if (!view || !view.render) view = mod.dashboard;

    var out;
    try { out = view.render(route.params); }
    catch (e) { console.error('Errore nel render della vista', e); out = { html: '<div class="empty">Errore nel rendering di questa vista.<br><span class="xsmall muted">' + esc(e.message) + '</span></div>' }; }

    // rimuove la barra "riapri pannelli" della modalita scrittura
    document.querySelectorAll('.pane-reopen').forEach(function (b) { b.remove(); });

    var routeChanged = routeKey !== prevRouteKey;
    var snap = routeChanged ? null : scrollSnapshot();

    viewEl.innerHTML = out.html || '';
    if (out.mount) { try { out.mount(viewEl, route.params); } catch (e) { console.error('Errore nel mount', e); MCW.toast('Errore in questa vista: ' + e.message, 'err', 5000); } }
    if (refreshNav !== false) { renderNav(); renderProjectTitle(); }
    if (global.innerWidth <= 760) closeNav();

    // la posizione non viene MAI azzerata se non si sta cambiando pagina
    if (routeChanged) { try { global.scrollTo(0, 0); } catch (e) {} } else { scrollRestore(snap); }
    prevRouteKey = routeKey;

    if (MCW._focusAfterRender) {
      var f = viewEl.querySelector(MCW._focusAfterRender);
      MCW._focusAfterRender = null;
      if (f) try { f.focus(); } catch (e) {}
    }
  }
  MCW.render = render;

  function closeNav() {
    if (sidebar) sidebar.classList.remove('open');
    if (scrim) scrim.classList.remove('show');
  }
  function toggleNav() {
    if (!sidebar) return;
    var open = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open);
    if (scrim) scrim.classList.toggle('show', open);
  }

  /* --------------------------------------------------------------- actions */
  var actions = MCW.actions = {};

  actions.nav = function (root, el) {
    var r = el.getAttribute('data-route');
    var scope = el.getAttribute('data-scope');
    global.location.hash = '#/' + r + (scope ? '/' + scope : '');
    closeNav();
  };
  actions['toggle-nav'] = toggleNav;
  actions['close-nav'] = closeNav;
  actions['toggle-pane'] = function () {};
  actions['show-pane'] = function () {};
  actions['open-search'] = function () { global.location.hash = '#/search'; MCW._focusAfterRender = '#gsearch'; };
  actions.print = function () { global.print(); };
  actions['reset-char-filters'] = function () {
    if (MCW._resetCharFilters) MCW._resetCharFilters();
  };
  actions['char-group'] = function (root, el) {
    MCW._setCharGroup(el.getAttribute('data-group'));
  };
  actions['open-graph'] = function () { global.location.hash = '#/graph'; };
  actions['read-font'] = function (root, el) {
    var d = MCW.parseInt0(el.getAttribute('data-dir'));
    MCW._fontScale = MCW.clamp((MCW._fontScale || 1) + d * 0.1, 0.75, 1.6);
    MCW.emit('ui');
  };
  actions['read-nav'] = function (root, el) {
    var sel = root.querySelector('#readScope');
    if (!sel) return;
    var dir = MCW.parseInt0(el.getAttribute('data-dir'));
    var idx = MCW.clamp(sel.selectedIndex + dir, 0, sel.options.length - 1);
    sel.selectedIndex = idx;
    var v = sel.value;
    if (v === 'full') global.location.hash = '#/reading';
    else { var p = v.split(':'); global.location.hash = '#/reading/' + p[0] + '/' + p[1]; }
  };

  /* ---- creazione entità ---- */
  function nextChapterNumber() {
    var max = 0;
    DB.list('chapters').forEach(function (c) { max = Math.max(max, c.number || 0); });
    return max + 1;
  }
  actions['new-chapter'] = function () {
    MCW.promptDialog('Nuovo capitolo', { label: 'Titolo del capitolo', value: 'Capitolo ' + nextChapterNumber(), ok: 'Crea' }).then(function (title) {
      if (title === null) return;
      var c = DB.create('chapters', {
        number: nextChapterNumber(), title: title || ('Capitolo ' + nextChapterNumber()), subtitle: '',
        status: 'Idea', description: '', cover: '', authorNotes: '', seasonId: null
      });
      MCW.toast('Capitolo creato · ora aggiungi una sezione');
      ui.go('#/chapters/' + c.id);
    });
  };
  function fakeEl(attrs) {
    return { getAttribute: function (k) { return attrs[k] == null ? null : String(attrs[k]); } };
  }
  actions['new-section'] = function (root, el) {
    var chapterId = el.getAttribute('data-chapter') || el.getAttribute('chapter');
    var ch = chapterId ? DB.get('chapters', chapterId) : null;
    if (!ch) {
      var chs = MCW.chaptersSorted();
      if (!chs.length) { MCW.toast('Crea prima un capitolo', 'warn'); actions['new-chapter'](); return; }
      ch = chs[chs.length - 1];
    }
    MCW.promptDialog('Nuova sezione', { label: 'Titolo della sezione (capitolo ' + (ch.number || '?') + ')', value: 'Nuova sezione', ok: 'Crea' }).then(function (title) {
      if (title === null) return;
      var s = DB.create('sections', {
        chapterId: ch.id, title: title || 'Nuova sezione', description: '', locationId: null, characterIds: [],
        objective: '', conflict: '', consequence: '', text: '', notes: ''
      });
      MCW.toast('Sezione creata');
      if (el.getAttribute('silent')) { render(); return; }
      ui.go('#/writing/section/' + s.id);
    });
  };
  actions['new-scene'] = function (root, el) {
    var sectionId = el.getAttribute('data-section') || el.getAttribute('section');
    var sec = DB.get('sections', sectionId);
    if (!sec) { MCW.toast('Sezione non trovata', 'warn'); return; }
    MCW.promptDialog('Nuova scena', { label: 'Titolo della scena', value: 'Nuova scena', ok: 'Crea' }).then(function (title) {
      if (title === null) return;
      var sc = DB.create('scenes', {
        chapterId: sec.chapterId, sectionId: sec.id, title: title || 'Nuova scena',
        characterIds: (sec.characterIds || []).slice(), locationId: sec.locationId || null, text: '', images: [], notes: ''
      });
      MCW.toast('Scena creata');
      ui.go('#/writing/scene/' + sc.id);
    });
  };
  function simpleCreate(kind, label, defaults, routePrefix) {
    return function () {
      MCW.promptDialog(label, { label: 'Nome', ok: 'Crea' }).then(function (name) {
        if (name === null) return;
        var rec = DB.create(kind, Object.assign({ name: name || label }, defaults));
        MCW.toast(label + ' creato');
        ui.go(routePrefix + rec.id);
      });
    };
  }
  actions['new-character'] = simpleCreate('characters', 'Nuovo personaggio', {
    alias: '', image: '', alignment: 'Neutrale', role: 'Personaggio secondario', importance: 'Occasionale',
    personality: '', appearance: '', age: '', species: '', faction: '', abilities: '', powers: '', weapons: '',
    strengths: '', weaknesses: '', goals: '', fears: '', backstory: '', secrets: '', quotes: '',
    firstAppearance: '', lastAppearance: '', notes: '', arc: {}
  }, '#/characters/');
  actions['new-location'] = simpleCreate('locations', 'Nuovo luogo', {
    category: 'Luoghi speciali', image: '', description: '', position: '', inhabitants: '', faction: '', characterIds: [], secrets: '', notes: ''
  }, '#/locations/');
  actions['new-object'] = simpleCreate('objects', 'Nuovo oggetto', {
    category: 'Arma', image: '', description: '', powers: '', origin: '', ownerIds: [], locationId: null, notes: ''
  }, '#/objects/');
  actions['new-event'] = simpleCreate('events', 'Nuovo evento', {
    description: '', chapterId: null, sectionId: null, sceneId: null, narrativeDate: '', locationId: null,
    characterIds: [], consequences: '', prevIds: [], nextIds: [], milestone: false
  }, '#/events/');

  actions['new-season'] = function () {
    MCW.promptDialog('Nuova stagione', { label: 'Titolo della stagione', value: 'Stagione ' + (DB.list('seasons').length + 1), ok: 'Crea' }).then(function (t) {
      if (t === null) return;
      DB.create('seasons', { number: DB.list('seasons').length + 1, title: t || 'Stagione', subtitle: '', description: '' });
      MCW.toast('Stagione creata');
    });
  };
  actions['edit-season'] = function (root, el) {
    var s = DB.get('seasons', el.getAttribute('data-id'));
    if (!s) return;
    MCW.openModal({
      title: 'Stagione', icon: '🗓️', size: 'sm',
      body: ui.field({ k: 'title', label: 'Titolo', value: s.title }) +
        ui.field({ k: 'subtitle', label: 'Sottotitolo', value: s.subtitle }) +
        ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 3, value: s.description }),
      footer: '<button class="btn ghost" data-m="close">Chiudi</button><button class="btn primary" data-m="save">Salva</button>',
      after: function (w) {
        w.querySelector('[data-m="save"]').onclick = function () {
          DB.update('seasons', s.id, ui.readForm(w));
          MCW.closeModal(); MCW.toast('Stagione aggiornata');
        };
      }
    });
  };

  actions['duplicate-chapter'] = function (root, el) {
    var id = el.getAttribute('data-id');
    var src = DB.get('chapters', id);
    if (!src) return;
    var copy = DB.create('chapters', Object.assign({}, src, {
      id: undefined, number: nextChapterNumber(), title: src.title + ' (copia)', status: 'Idea'
    }));
    var map = {};
    MCW.sectionsOf(id).forEach(function (s) {
      var ns = DB.create('sections', Object.assign({}, s, { id: undefined, chapterId: copy.id, title: s.title }));
      map[s.id] = ns.id;
    });
    MCW.scenesOfChapter(id).forEach(function (sc) {
      DB.create('scenes', Object.assign({}, sc, { id: undefined, chapterId: copy.id, sectionId: map[sc.sectionId] || null }));
    });
    MCW.toast('Capitolo duplicato con sezioni e scene');
    ui.go('#/chapters/' + copy.id);
  };

  actions['delete-entity'] = function (root, el) {
    var kind = el.getAttribute('data-kind'), id = el.getAttribute('data-id');
    var rec = DB.get(kind, id);
    ui.confirmDelete(kind, id, rec ? (rec.name || rec.title || rec.name) : null);
  };

  actions.reorder = function (root, el) {
    var kind = el.getAttribute('data-kind'), id = el.getAttribute('data-id'), dir = MCW.parseInt0(el.getAttribute('data-dir'));
    if (kind === 'sections') {
      var sec = DB.get('sections', id);
      DB.reorder('sections', id, dir, function (r) { return r.chapterId === sec.chapterId; });
    } else if (kind === 'scenes') {
      var sc = DB.get('scenes', id);
      DB.reorder('scenes', id, dir, function (r) { return r.sectionId === sc.sectionId; });
    } else {
      DB.reorder(kind, id, dir, null);
    }
  };
  actions['reorder-inline'] = function (root, el) {
    el.stopPropagation && el.stopPropagation();
    actions.reorder(root, el);
  };

  actions['save-chapter'] = function (root) {
    MCW.toast('Dettagli salvati');
  };

  /* ---- relazioni ---- */
  actions['add-relation'] = function (root, el) {
    var id = el.getAttribute('data-id');
    var type = root.querySelector('#relType').value;
    var to = root.querySelector('#relTarget').value;
    var desc = root.querySelector('#relDesc').value;
    if (!to) { MCW.toast('Serve almeno un altro personaggio', 'warn'); return; }
    DB.create('relations', { fromId: id, toId: to, type: type, description: desc });
    MCW.toast('Relazione aggiunta');
  };
  actions['edit-relation'] = function (root, el) {
    var r = DB.get('relations', el.getAttribute('data-id'));
    if (!r) return;
    var a = DB.get('characters', r.fromId), b = DB.get('characters', r.toId);
    MCW.openModal({
      title: 'Relazione: ' + (a ? a.name : '?') + ' → ' + (b ? b.name : '?'), icon: '🔗', size: 'sm',
      body: '<div class="field"><label class="f">Tipo</label><select data-field="type">' +
        E.relationType.map(function (t) { return '<option' + (r.type === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>' +
        ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 3, value: r.description }) +
        '<div class="field"><label class="f">Da</label><select data-field="fromId">' +
        DB.list('characters').map(function (c) { return '<option value="' + c.id + '"' + (r.fromId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>' +
        '<div class="field"><label class="f">A</label><select data-field="toId">' +
        DB.list('characters').map(function (c) { return '<option value="' + c.id + '"' + (r.toId === c.id ? ' selected' : '') + '>' + esc(c.name) + '</option>'; }).join('') + '</select></div>',
      footer: '<button class="btn ghost" data-m="close">Chiudi</button><button class="btn primary" data-m="save">Salva</button>',
      after: function (w) {
        w.querySelector('[data-m="save"]').onclick = function () {
          DB.update('relations', r.id, ui.readForm(w));
          MCW.closeModal(); MCW.toast('Relazione aggiornata');
        };
      }
    });
  };
  actions['del-relation'] = function (root, el) {
    DB.remove('relations', el.getAttribute('data-id'));
    MCW.toast('Relazione eliminata');
  };

  /* ---- idee ---- */
  function saveIdea(text, cat, opts) {
    if (!text || !text.trim()) { MCW.toast('Scrivi prima l\'idea', 'warn'); return null; }
    var rec = DB.create('ideas', { text: text.trim(), category: cat || 'Da sviluppare', status: 'aperta' });
    MCW.flush();
    MCW.toast('Idea salvata ✓');
    if (!(opts && opts.quiet)) MCW.emit('ideas');
    return rec;
  }
  actions['add-idea'] = function (root) {
    var ta = root.querySelector('#ideaText'), sel = root.querySelector('#ideaCat');
    saveIdea(ta ? ta.value : '', sel ? sel.value : 'Da sviluppare');
    if (ta) ta.value = '';
  };
  actions['quick-idea'] = function () {
    MCW.openModal({
      title: 'Idea veloce', icon: '💡', size: 'sm',
      body: '<div class="field"><label class="f">Scrivi l\'idea: viene salvata immediatamente</label>' +
        '<textarea id="qiText" rows="3" placeholder="Far incontrare Shadow e Kokushibo nel Nether."></textarea></div>' +
        '<div class="field"><label class="f">Classificazione</label><select id="qiCat">' +
        E.ideaCategory.map(function (c) { return '<option' + (c === 'Da sviluppare' ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>' +
        '<div class="xsmall muted">Puoi trasformarla in scena, evento, capitolo, personaggio o luogo dalla sezione Idee.</div>',
      footer: '<button class="btn ghost" data-m="close">Chiudi</button><button class="btn primary" data-m="save">Salva idea</button>',
      after: function (w) {
        var ta = w.querySelector('#qiText');
        ta.focus();
        function doSave() {
          var rec = saveIdea(ta.value, w.querySelector('#qiCat').value, { quiet: true });
          if (rec) { MCW.closeModal(); if (MCW.currentRoute.name === 'ideas') MCW.emit('ideas'); }
        }
        ta.onkeydown = function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') doSave(); };
        w.querySelector('[data-m="save"]').onclick = doSave;
      }
    });
  };
  actions['idea-toggle'] = function (root, el) {
    var i = DB.get('ideas', el.getAttribute('data-id'));
    if (!i) return;
    DB.update('ideas', i.id, { status: i.status === 'sviluppata' ? 'aperta' : 'sviluppata' });
  };
  actions['edit-idea'] = function (root, el) {
    var i = DB.get('ideas', el.getAttribute('data-id'));
    if (!i) return;
    MCW.openModal({
      title: 'Modifica idea', icon: '💡', size: 'sm',
      body: '<div class="field"><label class="f">Testo</label><textarea data-field="text" rows="4">' + esc(i.text) + '</textarea></div>' +
        '<div class="field"><label class="f">Classificazione</label><select data-field="category">' +
        E.ideaCategory.map(function (c) { return '<option' + (i.category === c ? ' selected' : '') + '>' + esc(c) + '</option>'; }).join('') + '</select></div>',
      footer: '<button class="btn ghost" data-m="close">Chiudi</button><button class="btn primary" data-m="save">Salva</button>',
      after: function (w) {
        w.querySelector('[data-m="save"]').onclick = function () {
          DB.update('ideas', i.id, ui.readForm(w)); MCW.closeModal(); MCW.toast('Idea aggiornata');
        };
      }
    });
  };
  actions['del-idea'] = function (root, el) {
    var i = DB.get('ideas', el.getAttribute('data-id'));
    MCW.confirmDialog('Eliminare questa idea?', { danger: true, ok: 'Elimina', detail: i ? i.text : '' }).then(function (ok) {
      if (ok) { DB.remove('ideas', i.id); MCW.toast('Idea eliminata'); }
    });
  };
  actions['convert-idea'] = function (root, el) {
    var i = DB.get('ideas', el.getAttribute('data-id'));
    var target = el.getAttribute('data-target');
    if (!i) return;
    var firstLine = i.text.split('\n')[0].slice(0, 70);
    var created = null, route = '';
    if (target === 'scene') {
      var secs = [];
      var chs = MCW.chaptersSorted();
      chs.forEach(function (c) { MCW.sectionsOf(c.id).forEach(function (s) { secs.push(s); }); });
      var sec = secs.length ? secs[secs.length - 1] : null;
      if (!sec) { MCW.toast('Crea prima una sezione', 'warn'); return; }
      created = DB.create('scenes', { chapterId: sec.chapterId, sectionId: sec.id, title: firstLine, characterIds: [], locationId: sec.locationId || null, text: '<p>' + esc(i.text) + '</p>', images: [], notes: 'Creata dall\'idea del ' + MCW.fmtDate(i.createdAt) });
      route = '#/writing/scene/' + created.id;
    } else if (target === 'event') {
      created = DB.create('events', { title: firstLine, description: i.text, chapterId: null, sectionId: null, sceneId: null, narrativeDate: '', locationId: null, characterIds: [], consequences: '', prevIds: [], nextIds: [], milestone: false });
      route = '#/events/' + created.id;
    } else if (target === 'chapter') {
      created = DB.create('chapters', { number: nextChapterNumber(), title: firstLine, subtitle: '', status: 'Idea', description: i.text, cover: '', authorNotes: 'Idea del ' + MCW.fmtDate(i.createdAt), seasonId: null });
      route = '#/chapters/' + created.id;
    } else if (target === 'character') {
      created = DB.create('characters', { name: firstLine, alias: '', image: '', alignment: 'Neutrale', role: 'Personaggio secondario', importance: 'Occasionale', personality: i.text, arc: {}, firstAppearance: '', lastAppearance: '', notes: 'Idea del ' + MCW.fmtDate(i.createdAt) });
      route = '#/characters/' + created.id;
    } else if (target === 'location') {
      created = DB.create('locations', { name: firstLine, category: 'Luoghi speciali', image: '', description: i.text, characterIds: [], notes: 'Idea del ' + MCW.fmtDate(i.createdAt) });
      route = '#/locations/' + created.id;
    }
    if (created) {
      DB.update('ideas', i.id, { status: 'sviluppata' });
      MCW.toast('Idea trasformata ✓');
      ui.go(route);
    }
  };

  /* ---- note ---- */
  actions['add-note'] = function (root) {
    var ta = root.querySelector('#noteText');
    var tag = root.querySelector('#noteTag');
    var chSel = root.querySelector('#noteChapter');
    if (!ta || !ta.value.trim()) { MCW.toast('Scrivi prima la nota', 'warn'); return; }
    var tagVal = (tag ? tag.value : '[ALTRO]').replace(/[\[\]]/g, '');
    DB.create('notes', {
      text: ta.value.trim(), tag: tagVal, status: 'aperta',
      chapterId: chSel && chSel.value ? chSel.value : null
    });
    ta.value = '';
    MCW.toast('Nota salvata in Da sistemare ✓');
    MCW.emit('notes');
  };
  actions['new-note'] = function () {
    MCW.openModal({
      title: 'Nota libera', icon: '📝', size: 'sm',
      body: '<div class="field"><label class="f">Testo</label><textarea id="nnText" rows="3" placeholder="[DA CONTROLLARE] …"></textarea></div>' +
        '<div class="field"><label class="f">Etichetta</label><select id="nnTag">' + E.noteTag.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select></div>',
      footer: '<button class="btn ghost" data-m="close">Chiudi</button><button class="btn primary" data-m="save">Salva</button>',
      after: function (w) {
        w.querySelector('#nnText').focus();
        w.querySelector('[data-m="save"]').onclick = function () {
          var t = w.querySelector('#nnText').value.trim();
          if (!t) return;
          DB.create('notes', { text: t, tag: w.querySelector('#nnTag').value, status: 'aperta', chapterId: null });
          MCW.closeModal(); MCW.toast('Nota salvata ✓');
          if (MCW.currentRoute.name === 'notes') MCW.emit('notes');
        };
      }
    });
  };
  actions['note-toggle'] = function (root, el) {
    var n = DB.get('notes', el.getAttribute('data-id'));
    if (!n) return;
    DB.update('notes', n.id, { status: n.status === 'risolta' ? 'aperta' : 'risolta' });
  };
  actions['edit-note'] = function (root, el) {
    var n = DB.get('notes', el.getAttribute('data-id'));
    if (!n) return;
    MCW.openModal({
      title: 'Modifica nota', icon: '📝', size: 'sm',
      body: '<div class="field"><label class="f">Testo</label><textarea data-field="text" rows="4">' + esc(n.text) + '</textarea></div>' +
        '<div class="field"><label class="f">Etichetta</label><select data-field="tag">' +
        E.noteTag.map(function (t) { return '<option' + (n.tag === t ? ' selected' : '') + '>' + esc(t) + '</option>'; }).join('') + '</select></div>',
      footer: '<button class="btn ghost" data-m="close">Chiudi</button><button class="btn primary" data-m="save">Salva</button>',
      after: function (w) {
        w.querySelector('[data-m="save"]').onclick = function () {
          DB.update('notes', n.id, ui.readForm(w)); MCW.closeModal(); MCW.toast('Nota aggiornata');
        };
      }
    });
  };
  actions['del-note'] = function (root, el) {
    var n = DB.get('notes', el.getAttribute('data-id'));
    if (!n) return;
    DB.remove('notes', n.id); MCW.toast('Nota eliminata');
  };

  /* ---- impostazioni: progetto, backup, versioni, PWA ---- */
  actions['save-settings'] = function (root) {
    var f = ui.readForm(root);
    var s = Object.assign({}, DB.project().settings);
    if ('autosave' in f) s.autosave = !!f.autosave;
    if ('autoBackup' in f) s.autoBackup = !!f.autoBackup;
    DB.setProject({ name: f.name || 'La mia serie', author: f.author, description: f.description, settings: s });
    MCW.flush();
    MCW.toast('Impostazioni salvate');
  };
  actions['export-json'] = function () {
    try {
      var data = MCW.exportJSON();
      var blob = new Blob([JSON.stringify(data, null, 1)], { type: 'application/json' });
      var url = URL.createObjectURL(blob);
      var a = document.createElement('a');
      var name = 'minecraft-series-writer_' + new Date().toISOString().slice(0, 10) + '.json';
      a.href = url; a.download = name;
      document.body.appendChild(a); a.click();
      setTimeout(function () { URL.revokeObjectURL(url); a.remove(); }, 1500);
      MCW.toast('Backup esportato: ' + name);
    } catch (e) { MCW.toast('Esportazione non riuscita: ' + e.message, 'err'); }
  };
  function pickFile(mode) {
    var input = document.getElementById('importFile');
    input.onchange = function () {
      var f = input.files && input.files[0];
      if (!f) return;
      var fr = new FileReader();
      fr.onload = function () {
        try {
          var obj = JSON.parse(fr.result);
          var counts = MCW.importJSON(obj, mode === 'merge' ? 'merge' : 'replace');
          MCW.flush();
          MCW.toast(mode === 'merge' ? 'Backup unito ✓' : 'Progetto importato ✓ (' + counts.chapters + ' capitoli, ' + counts.characters + ' personaggi)');
          render();
        } catch (e) { MCW.toast('File non valido: ' + e.message, 'err', 5000); }
        input.value = '';
      };
      fr.readAsText(f);
    };
    input.click();
  }
  actions['import-json'] = function () {
    MCW.confirmDialog('Importare un backup? Il progetto attuale verrà sostituito.', { title: 'Importa progetto', ok: 'Scegli il file' }).then(function (ok) { if (ok) pickFile('replace'); });
  };
  actions['import-merge'] = function () { pickFile('merge'); };

  actions['snapshot-create'] = function () {
    MCW.promptDialog('Crea versione', { label: 'Nome della versione', value: 'Versione del ' + MCW.fmtDate(new Date().toISOString()) + ' ' + MCW.fmtTime(new Date().toISOString()), ok: 'Crea' }).then(function (name) {
      if (name === null) return;
      MCW.createSnapshot(name, {});
      MCW.flush();
      MCW.toast('Versione creata ✓');
    });
  };
  actions['snapshot-restore'] = function (root, el) {
    var s = DB.get('snapshots', el.getAttribute('data-id'));
    if (!s) return;
    MCW.confirmDialog('Ripristinare «' + s.name + '»? Il progetto attuale verrà sostituito da questa versione.', { title: 'Ripristina versione', ok: 'Ripristina', danger: true })
      .then(function (ok) {
        if (!ok) return;
        if (MCW.restoreSnapshot(s.id)) { MCW.toast('Versione ripristinata ✓'); render(); }
      });
  };
  actions['seed-demo'] = function () {
    MCW.confirmDialog('Caricare il progetto demo? I contenuti demo verranno aggiunti/sovrascritti (i tuoi dati con altri ID restano).', { title: 'Progetto demo', ok: 'Carica demo' })
      .then(function (ok) { if (ok) { MCW.seed(true); MCW.flush(); MCW.toast('Progetto demo caricato'); render(); } });
  };
  actions['wipe-all'] = function () {
    MCW.confirmDialog('Cancellare TUTTI i dati di questa app nel browser? L\'operazione non è reversibile.', { title: 'Cancella tutti i dati', ok: 'Cancella tutto', danger: true, detail: 'Esporta prima un backup JSON.' })
      .then(function (ok) {
        if (!ok) return;
        DB.clearAll().then(function () {
          var s = Object.assign({}, DB.project().settings, { seeded: true });
          DB.setProject({ settings: s });
          MCW.flush();
          MCW.toast('Dati cancellati');
          render();
        });
      });
  };
  var deferredPrompt = null;
  global.addEventListener('beforeinstallprompt', function (e) { e.preventDefault(); deferredPrompt = e; setPwaState('Pronto per l\'installazione'); });
  global.addEventListener('appinstalled', function () { setPwaState('App installata ✓'); MCW.toast('App installata sul dispositivo ✓'); });
  function setPwaState(txt) { var el = document.getElementById('pwaState'); if (el) el.textContent = txt; }
  actions['install-pwa'] = function () {
    if (deferredPrompt) { deferredPrompt.prompt(); deferredPrompt = null; return; }
    if (global.navigator && global.navigator.standalone) { MCW.toast('App già avviata come applicazione installata'); return; }
    MCW.openModal({
      title: 'Installare l\'app?', icon: '📲', size: 'sm',
      body: '<p>Il browser non ha ancora offerto l\'installazione automatica. Puoi comunque aggiungerla alla schermata Home:</p>' +
        '<ul><li><strong>Android / Chrome:</strong> menu ⋮ → «Aggiungi a schermata Home» o «Installa app».</li>' +
        '<li><strong>iOS / Safari:</strong> Condividi → «Aggiungi a schermata Home».</li></ul>' +
        '<p class="small muted">L\'app funziona anche senza installazione: basta il browser. I dati restano nel telefono.</p>',
      footer: '<button class="btn primary" data-m="close">Ho capito</button>'
    });
  };

  /* ------------------------------------------------------- click delegate */
  function onClick(ev) {
    var el;
    el = ev.target.closest('[data-act]');
    if (el) {
      var act = el.getAttribute('data-act');
      if (actions[act]) {
        ev.preventDefault();
        try { actions[act](viewEl, el); } catch (e) { console.error(e); MCW.toast('Azione non riuscita: ' + e.message, 'err', 4000); }
        return;
      }
    }
    el = ev.target.closest('[data-open]');
    if (el) {
      ev.preventDefault();
      ui.openCard(el.getAttribute('data-open'), el.getAttribute('data-id'));
      return;
    }
    el = ev.target.closest('[data-go]');
    if (el) {
      ev.preventDefault();
      var dest = el.getAttribute('data-go');
      if (dest && dest !== '#') global.location.hash = dest.replace(/^#/, '');
      closeNav();
      return;
    }
  }
  function onKey(ev) {
    if ((ev.ctrlKey || ev.metaKey) && ev.key.toLowerCase() === 'k') {
      ev.preventDefault();
      global.location.hash = '#/search';
      MCW._focusAfterRender = '#gsearch';
      return;
    }
    if (ev.key === 'Escape') {
      var root = document.getElementById('modalRoot');
      if (root && !root.hidden) { MCW.closeModal(); return; }
      closeNav();
    }
  }

  /* --------------------------------------------------------------- il boot */
  function boot() {
    viewEl = document.getElementById('view');
    navEl = document.getElementById('mainnav');
    scrim = document.getElementById('navScrim');
    sidebar = document.getElementById('sidebar');

    MCW.onStatus(function (st, at) {
      var ind = document.getElementById('saveInd');
      if (!ind) return;
      ind.classList.remove('saving', 'error');
      var txt = ind.querySelector('.si-txt');
      if (st === 'saving') { ind.classList.add('saving'); txt.textContent = 'Salvataggio...'; }
      else if (st === 'error') { ind.classList.add('error'); txt.textContent = 'Errore di salvataggio'; }
      else { txt.textContent = at ? 'Ultimo salvataggio: ' + MCW.fmtTime(at) : '✓ Salvato'; }
      var foot = document.getElementById('storageLine');
      if (foot) foot.textContent = (DB.mode === 'indexeddb' ? 'IndexedDB' : 'localStorage') +
        ' · ' + MCW.totals().chapters + ' capitoli';
    });

    document.addEventListener('click', onClick);
    document.addEventListener('keydown', onKey);
    global.addEventListener('hashchange', function () { render(); });
    // La tastiera mobile genera eventi resize: NON deve provocare un render dell'editor.
    var _lastW = global.innerWidth;
    global.addEventListener('resize', MCW.debounce(function () {
      var w = global.innerWidth;
      var changed = (w <= 760) !== (_lastW <= 760);
      _lastW = w;
      if (!changed) return;                       // stessa fascia di layout: nessun render
      if (editorProtected()) { MCW._renderPending = true; return; }
      render();
    }, 300));
    // flush prima di chiudere la pagina
    global.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') MCW.flush(); });
    global.addEventListener('beforeunload', function () { MCW.flush(); });

    // Intercetta ogni submit: nessun invio accidentale di form (niente reload)
    // applica subito il tema scelto (viola di default)
    if (MCW.applyTheme) MCW.applyTheme();

    document.addEventListener('submit', function (ev) { ev.preventDefault(); }, true);

    MCW.subscribe(function (reason) {
      reason = String(reason || 'data');
      if (reason.indexOf('go:') === 0) { global.location.hash = reason.slice(3); return; }

      // durante la scrittura non si ricostruisce nulla: solo i contatori del menu
      if (editorProtected()) {
        MCW._renderPending = true;
        renderNav(); renderProjectTitle();
        return;
      }

      // eliminazione: aggiornamento MIRATO, senza rerender e senza toccare lo scroll
      if (reason === 'delete') {
        var info = MCW.lastDeleteInfo && MCW.lastDeleteInfo();
        var removed = info ? MCW.removeDeletedNode(info.kind, info.id) : false;
        renderNav(); renderProjectTitle();
        if (!removed) render();          // fallback: l'elemento non era nel DOM
        return;
      }

      // impostazioni / tema: aggiornamento leggero, nessun rerender della vista
      if (reason === 'settings' || reason === 'theme') { renderNav(); renderProjectTitle(); return; }

      // progetto: i campi sono gia' aggiornati dall'utente, niente rerender (tranne la dashboard)
      if (reason === 'project') {
        renderNav(); renderProjectTitle();
        if (MCW.currentRoute.name === 'dashboard') render();
        return;
      }

      render();
    });

    MCW.init().then(function () {
      render();
      MCW.startAutoBackup();
      var mode = DB.mode;
      var foot = document.getElementById('storageLine');
      if (foot) foot.textContent = (mode === 'indexeddb' ? 'IndexedDB' : 'localStorage') + ' · ' + MCW.totals().chapters + ' capitoli';
      console.log('[MCW] avviato · persistenza:', mode, '· dati:', MCW.totals());
    }).catch(function (e) {
      console.error('[MCW] errore di avvio', e);
      MCW.applyFallback && MCW.applyFallback();
      render();
    });

    if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1')) {
      navigator.serviceWorker.register('sw.js').then(function () {
        console.log('[MCW] service worker registrato');
      }).catch(function (e) { console.warn('[MCW] service worker non registrato', e); });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})(typeof globalThis !== 'undefined' ? globalThis : this);
