/* ==========================================================================
   views-cast.js — Personaggi (4 categorie, filtri, scheda completa, relazioni,
   arco narrativo, presenze), Luoghi, Oggetti.
   ========================================================================== */
(function (global) {
  'use strict';
  var MCW = global.MCW; if (!MCW) return;
  var DB = MCW.DB, esc = MCW.esc, nf = MCW.nf, E = MCW.ENUM;
  var ui = MCW.ui;

  var charFilter = { group: 'all', role: 'all', alignment: 'all', presence: 'all', q: '' };
  MCW._setCharGroup = function (g) { charFilter.group = g; MCW.emit('filter'); };
  MCW._resetCharFilters = function () {
    charFilter.group = 'all'; charFilter.role = 'all';
    charFilter.alignment = 'all'; charFilter.presence = 'all'; charFilter.q = '';
    MCW.emit('filter');
  };

  function matchesFilters(c) {
    if (charFilter.group !== 'all' && MCW.roleGroup(c.role) !== charFilter.group) return false;
    if (charFilter.role !== 'all' && c.role !== charFilter.role) return false;
    if (charFilter.alignment !== 'all' && c.alignment !== charFilter.alignment) return false;
    if (charFilter.presence !== 'all' && c.importance !== charFilter.presence) return false;
    if (charFilter.q) {
      var q = charFilter.q.toLowerCase();
      var hay = [c.name, c.alias, c.faction, c.species, c.personality, c.backstory, c.goals, c.secrets, c.quotes].join(' ').toLowerCase();
      if (hay.indexOf(q) < 0) return false;
    }
    return true;
  }

  function charCard(c) {
    var pres = MCW.presenceOf(c.id);
    return '<div class="card hover" data-go="#/characters/' + c.id + '">' +
      '<div class="row" style="gap:11px;align-items:flex-start">' + ui.avatar(c, '') +
      '<div style="flex:1;min-width:0"><div class="row tight"><strong>' + esc(c.name || 'Senza nome') + '</strong></div>' +
      (c.alias ? '<div class="xsmall muted">«' + esc(c.alias) + '»</div>' : '') +
      '<div class="row tight" style="margin-top:5px">' + ui.alignPill(c.alignment) + ui.rolePill(c.role) + '</div>' +
      (c.importance ? '<div class="xsmall muted" style="margin-top:4px">Presenza: ' + esc(c.importance) + '</div>' : '') +
      '</div></div>' +
      '<div class="xsmall muted" style="margin-top:9px">' + esc(MCW.excerpt(c.personality || c.backstory, 96)) + '</div>' +
      '<div class="row tight" style="margin-top:9px">' +
      '<span class="pill ghost">📚 ' + pres.chapters.length + ' cap.</span>' +
      '<span class="pill ghost">🎬 ' + pres.sceneCount + ' scene</span>' +
      '<span class="pill ghost">⚔️ ' + pres.eventCount + ' eventi</span>' +
      '</div></div>';
  }

  MCW.views.characters = {
    render: function (p) {
      if (p && p.id) return MCW.views.characterDetail.render(p);
      var all = DB.list('characters');
      var byGroup = { protagonists: [], antagonists: [], secondary: [], others: [] };
      all.forEach(function (c) { byGroup[MCW.roleGroup(c.role)].push(c); });
      var filtered = all.filter(matchesFilters);

      var h = '<div class="viewhead"><div><h1>👥 Personaggi</h1><div class="sub">' + all.length + ' personaggi · ' +
        byGroup.protagonists.length + ' protagonisti · ' + byGroup.antagonists.length + ' antagonisti · ' +
        byGroup.secondary.length + ' secondari · ' + byGroup.others.length + ' altri/ricorrenti</div></div>' +
        '<div class="spacer"></div><div class="row tight">' +
        '<button class="btn ghost" data-act="open-graph">🔗 Grafo relazioni</button>' +
        '<button class="btn primary" data-act="new-character">+ Nuovo personaggio</button></div></div>';

      h += '<div class="row tight" style="margin-bottom:6px">' +
        '<select id="cfRole" style="max-width:210px"><option value="all">Tutti i ruoli</option>' +
        E.role.map(function (r) { return '<option' + (charFilter.role === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' +
        '<select id="cfAlign" style="max-width:190px"><option value="all">Tutti gli schieramenti</option>' +
        E.alignment.map(function (r) { return '<option' + (charFilter.alignment === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' +
        '<select id="cfPres" style="max-width:180px"><option value="all">Tutte le presenze</option>' +
        E.importance.map(function (r) { return '<option' + (charFilter.presence === r ? ' selected' : '') + '>' + esc(r) + '</option>'; }).join('') + '</select>' +
        '<input type="text" id="cfQ" placeholder="Cerca nome, alias, fazione…" style="max-width:250px" value="' + esc(charFilter.q) + '" />' +
        '<button class="btn sm ghost" data-act="reset-char-filters">Azzera filtri</button></div>' +
        '<div class="row tight" style="margin-bottom:14px">' +
        [['all', 'Tutti'], ['protagonists', '⭐ Protagonisti'], ['antagonists', '☠️ Antagonisti'], ['secondary', '👥 Secondari'], ['others', '👤 Altri/Ricorrenti']]
          .map(function (g) {
            return '<button class="btn sm' + (charFilter.group === g[0] ? ' primary' : ' ghost') + '" data-act="char-group" data-group="' + g[0] + '">' + g[1] + '</button>';
          }).join('') +
        '<span class="small muted">' + filtered.length + ' risultati</span></div>';

      var groups = charFilter.group === 'all' ? MCW.CAST_GROUPS : MCW.CAST_GROUPS.filter(function (g) { return g.key === charFilter.group; });
      var printed = 0;
      groups.forEach(function (g) {
        var list = byGroup[g.key].filter(matchesFilters);
        if (!list.length && charFilter.group !== g.key && (charFilter.q || charFilter.role !== 'all' || charFilter.alignment !== 'all' || charFilter.presence !== 'all')) return;
        h += '<div class="section-title">' + g.icon + ' ' + g.title + ' <span class="pill ghost">' + byGroup[g.key].length + '</span></div>' +
          '<div class="small muted" style="margin:-4px 0 10px">' + g.desc + '</div>';
        if (!list.length) h += '<div class="empty small">Nessun personaggio in questa categoria' + (all.length ? '' : '. Crea il primo personaggio!') + '</div>';
        else h += '<div class="card-grid">' + list.map(charCard).join('') + '</div>';
        printed += list.length;
      });
      if (all.length && !printed) h += '<div class="empty">Nessun personaggio corrisponde ai filtri.</div>';

      return {
        html: h,
        mount: function (root) {
          bind('cfRole', 'role'); bind('cfAlign', 'alignment'); bind('cfPres', 'presence');
          function bind(id, key) {
            var el = root.querySelector('#' + id);
            if (el) el.onchange = function () { charFilter[key] = el.value; MCW.emit('filter'); };
          }
          var q = root.querySelector('#cfQ');
          if (q) q.oninput = MCW.debounce(function () { charFilter.q = q.value; MCW.emit('filter'); }, 250);
        }
      };
    }
  };

  /* ------------------------------------------------------ scheda personaggio */
  MCW.views.characterDetail = {
    render: function (p) {
      var c = DB.get('characters', p.id);
      if (!c) return { html: '<div class="empty">Personaggio non trovato. <button class="btn sm" data-go="#/characters">Torna all\'elenco</button></div>' };
      var pres = MCW.presenceOf(c.id);
      var rels = MCW.relationsOf(c.id);
      var objs = MCW.objectsOfChar(c.id);
      var notes = DB.list('notes').filter(function (n) { return (n.text || '').toLowerCase().indexOf((c.name || '').toLowerCase()) >= 0 && c.name; });
      var arc = c.arc || {};

      var h = '<div class="viewhead">' +
        '<div><div class="xsmall muted"><span data-go="#/characters" style="cursor:pointer">👥 Personaggi</span> / ' + esc(c.name || '') + '</div>' +
        '<h1>' + esc(c.name || 'Senza nome') + (c.alias ? ' <span class="muted" style="font-size:17px">«' + esc(c.alias) + '»</span>' : '') + '</h1>' +
        '<div class="row tight" style="margin-top:6px">' + ui.alignPill(c.alignment) + ui.rolePill(c.role) + ui.presencePill(c.importance) +
        (c.faction ? '<span class="pill">' + esc(c.faction) + '</span>' : '') + '</div></div>' +
        '<div class="spacer"></div><div class="row tight">' +
        '<button class="btn ghost" data-act="delete-entity" data-kind="characters" data-id="' + c.id + '">🗑️ Elimina</button>' +
        '<span class="small muted">Salvataggio automatico attivo</span></div></div>';

      h += '<div class="stat-grid" style="margin-bottom:16px">' +
        stat('📚', 'Prima apparizione', pres.firstChapter ? pres.firstChapter.title : '—', pres.firstChapter ? 'Capitolo ' + (pres.firstChapter.number || '?') : 'nessun collegamento') +
        stat('📚', 'Ultima apparizione', pres.lastChapter ? pres.lastChapter.title : '—', pres.lastChapter ? 'Capitolo ' + (pres.lastChapter.number || '?') : '—') +
        stat('📖', 'Numero di capitoli', pres.chapters.length, '') +
        stat('🎬', 'Numero di scene', pres.sceneCount, pres.sectionCount + ' sezioni') +
        stat('⚔️', 'Eventi principali', pres.eventCount, '') +
        stat('✍️', 'Parole nelle sue scene', nf(pres.words), '') +
        '</div>';

      h += '<div class="tabs" data-tabs="ch"><button class="tab active" data-tab="scheda">Scheda</button>' +
        '<button class="tab" data-tab="arco">Arco narrativo</button>' +
        '<button class="tab" data-tab="relazioni">Relazioni <span class="pill ghost">' + rels.length + '</span></button>' +
        '<button class="tab" data-tab="presenza">Presenza nella storia</button></div>';

      /* --- scheda --- */
      h += '<div data-tabpane="scheda">' +
        '<div class="grid c2">' +
        ui.field({ k: 'name', label: 'Nome', value: c.name }) +
        ui.field({ k: 'alias', label: 'Alias', value: c.alias }) +
        ui.field({ k: 'alignment', label: 'Schieramento / Allineamento', type: 'select', value: c.alignment, options: E.alignment }) +
        ui.field({ k: 'role', label: 'Ruolo narrativo', type: 'select', value: c.role, options: E.role }) +
        ui.field({ k: 'importance', label: 'Importanza / Presenza', type: 'select', value: c.importance, options: E.importance }) +
        ui.field({ k: 'image', label: 'Immagine', type: 'image', value: c.image }) +
        ui.field({ k: 'age', label: 'Età', value: c.age }) +
        ui.field({ k: 'species', label: 'Specie', value: c.species }) +
        ui.field({ k: 'faction', label: 'Fazione', value: c.faction }) +
        ui.field({ k: 'weapons', label: 'Armi', value: c.weapons }) +
        ui.field({ k: 'firstAppearance', label: 'Prima apparizione (nota manuale)', value: c.firstAppearance }) +
        ui.field({ k: 'lastAppearance', label: 'Ultima apparizione (nota manuale)', value: c.lastAppearance }) +
        '</div>' +
        ui.field({ k: 'personality', label: 'Personalità', type: 'textarea', rows: 3, value: c.personality }) +
        ui.field({ k: 'appearance', label: 'Aspetto', type: 'textarea', rows: 2, value: c.appearance }) +
        ui.field({ k: 'abilities', label: 'Abilità', type: 'textarea', rows: 2, value: c.abilities }) +
        ui.field({ k: 'powers', label: 'Poteri', type: 'textarea', rows: 2, value: c.powers }) +
        '<div class="grid c2">' + ui.field({ k: 'strengths', label: 'Punti di forza', type: 'textarea', rows: 2, value: c.strengths }) +
        ui.field({ k: 'weaknesses', label: 'Debolezze', type: 'textarea', rows: 2, value: c.weaknesses }) + '</div>' +
        '<div class="grid c2">' + ui.field({ k: 'goals', label: 'Obiettivi', type: 'textarea', rows: 2, value: c.goals }) +
        ui.field({ k: 'fears', label: 'Paure', type: 'textarea', rows: 2, value: c.fears }) + '</div>' +
        ui.field({ k: 'backstory', label: 'Passato', type: 'textarea', rows: 4, value: c.backstory }) +
        ui.field({ k: 'secrets', label: 'Segreti', type: 'textarea', rows: 2, value: c.secrets }) +
        ui.field({ k: 'quotes', label: 'Frasi caratteristiche', type: 'textarea', rows: 2, value: c.quotes }) +
        ui.field({ k: 'notes', label: 'Note dell\'autore', type: 'textarea', rows: 2, value: c.notes }) +
        '</div>';

      /* --- arco --- */
      h += '<div data-tabpane="arco" hidden>' +
        '<div class="hint" style="margin-bottom:12px">L\'arco narrativo resta vuoto finché non lo scrivi: la dashboard segnala i personaggi senza arco.</div>' +
        ui.field({ k: 'arc_inizio', label: 'Inizio', type: 'textarea', rows: 2, value: arc.inizio }) +
        ui.field({ k: 'arc_sviluppo', label: 'Sviluppo', type: 'textarea', rows: 2, value: arc.sviluppo }) +
        ui.field({ k: 'arc_svolta', label: 'Punto di svolta', type: 'textarea', rows: 2, value: arc.svolta }) +
        ui.field({ k: 'arc_evoluzione', label: 'Evoluzione', type: 'textarea', rows: 2, value: arc.evoluzione }) +
        ui.field({ k: 'arc_attuale', label: 'Situazione attuale', type: 'textarea', rows: 2, value: arc.attuale }) +
        ui.field({ k: 'arc_futuro', label: 'Possibile futuro', type: 'textarea', rows: 2, value: arc.futuro }) +
        '</div>';

      /* --- relazioni --- */
      h += '<div data-tabpane="relazioni" hidden>' +
        '<div class="row tight" style="margin-bottom:12px">' +
        '<select id="relType" style="max-width:220px">' + E.relationType.map(function (t) { return '<option>' + esc(t) + '</option>'; }).join('') + '</select>' +
        '<select id="relTarget" style="max-width:260px">' + DB.list('characters').filter(function (x) { return x.id !== c.id; })
          .map(function (x) { return '<option value="' + x.id + '">' + esc(x.name) + '</option>'; }).join('') + '</select>' +
        '<input type="text" id="relDesc" placeholder="Descrizione del rapporto (opzionale)" style="max-width:320px" />' +
        '<button class="btn primary sm" data-act="add-relation" data-id="' + c.id + '">+ Aggiungi relazione</button></div>';
      if (!rels.length) h += '<div class="empty small">Nessuna relazione. Collega ' + esc(c.name) + ' ad altri personaggi.</div>';
      else h += rels.map(function (r) {
        var otherId = r.fromId === c.id ? r.toId : r.fromId;
        var other = DB.get('characters', otherId);
        var dir = r.fromId === c.id ? '→' : '←';
        return '<div class="rel-row">' + ui.avatar(other || {}, 'sm') +
          '<div style="flex:1;min-width:0"><div class="small"><strong data-open="characters" data-id="' + otherId + '" style="cursor:pointer">' + esc(other ? other.name : '?') + '</strong> ' +
          '<span class="pill role">' + esc(r.type || '') + '</span> ' + dir + '</div>' +
          (r.description ? '<div class="xsmall muted">' + esc(r.description) + '</div>' : '') + '</div>' +
          '<button class="btn sm ghost" data-act="edit-relation" data-id="' + r.id + '">Modifica</button>' +
          '<button class="btn sm ghost" data-act="del-relation" data-id="' + r.id + '">🗑️</button></div>';
      }).join('');
      h += '<div style="margin-top:16px"><button class="btn ghost sm" data-act="open-graph">🔗 Vedi il grafo completo</button></div></div>';

      /* --- presenza --- */
      h += '<div data-tabpane="presenza" hidden>' +
        '<div class="field"><label class="f">Capitoli in cui compare (' + pres.chapters.length + ') — clicca per aprire</label>' +
        (pres.chapters.length ? '<div class="row tight">' + pres.chapters.map(function (ch) { return ui.chip('chapters', ch.id); }).join(' ') + '</div>' : '<span class="muted small">—</span>') + '</div>' +
        '<div class="field"><label class="f">Scene in cui compare</label>' +
        '<div class="list">' + sceneRows(c.id) + '</div></div>' +
        '<div class="field"><label class="f">Eventi in cui compare</label>' +
        (pres.eventCount ? '<div class="list">' + DB.list('events').filter(function (e) { return (e.characterIds || []).indexOf(c.id) >= 0; }).map(function (e) {
          return '<div class="list-row" data-open="events" data-id="' + e.id + '"><span>⚔️</span><div style="flex:1"><strong>' + esc(e.title) + '</strong>' +
            '<div class="xsmall muted">' + esc(MCW.excerpt(e.description, 90)) + '</div></div></div>';
        }).join('') + '</div>' : '<span class="muted small">—</span>') + '</div>' +
        '<div class="field"><label class="f">Luoghi collegati</label>' +
        (pres.locationIds.length ? '<div class="row tight">' + pres.locationIds.map(function (l) { return ui.chip('locations', l); }).join(' ') + '</div>' : '<span class="muted small">—</span>') + '</div>' +
        '<div class="field"><label class="f">Oggetti associati</label>' +
        (objs.length ? '<div class="row tight">' + objs.map(function (o) { return ui.chip('objects', o.id); }).join(' ') + '</div>' : '<span class="muted small">—</span>') + '</div>' +
        (notes.length ? '<div class="field"><label class="f">Note che lo citano</label>' + notes.map(function (n) {
          return '<div class="list-row" data-open="notes" data-id="' + n.id + '"><span>📝</span><div style="flex:1" class="small">' + esc(n.text) + '</div></div>';
        }).join('') + '</div>' : '') + '</div>';

      return {
        html: h,
        mount: function (root) {
          ui.bindForm(root);
          root.querySelectorAll('[data-tabs="ch"] .tab').forEach(function (t) {
            t.onclick = function () {
              var cur = t.getAttribute('data-tab');
              root.querySelectorAll('[data-tabs="ch"] .tab').forEach(function (x) { x.classList.toggle('active', x === t); });
              root.querySelectorAll('[data-tabpane]').forEach(function (pn) { pn.hidden = pn.getAttribute('data-tabpane') !== cur; });
            };
          });
          var timer = null;
          root.querySelectorAll('[data-tabpane] [data-field]').forEach(function (el) {
            var ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
            el.addEventListener(ev, function () {
              clearTimeout(timer);
              timer = setTimeout(function () {
                var f = {};
                ['scheda', 'arco'].forEach(function (pane) {
                  var box = root.querySelector('[data-tabpane="' + pane + '"]');
                  if (!box) return;
                  var vals = ui.readForm(box);
                  Object.keys(vals).forEach(function (k) {
                    if (k.indexOf('arc_') === 0) { f.arc = f.arc || Object.assign({}, arc); f.arc[k.slice(4)] = vals[k]; }
                    else f[k] = vals[k];
                  });
                });
                DB.updateSilent('characters', c.id, f);
                MCW.flush();
              }, 450);
            });
          });
        }
      };
    }
  };

  function sceneRows(charId) {
    var rows = DB.list('scenes').filter(function (s) { return (s.characterIds || []).indexOf(charId) >= 0; });
    if (!rows.length) return '<span class="muted small">—</span>';
    return rows.map(function (s) {
      var ch = MCW.chapterOfScene(s), se = MCW.sectionOfScene(s);
      return '<div class="list-row" data-go="#/writing/scene/' + s.id + '"><span>🎬</span><div style="flex:1;min-width:0">' +
        '<strong class="small">' + esc(s.title || 'Scena') + '</strong>' +
        '<div class="xsmall muted">' + (ch ? 'Cap. ' + (ch.number || '?') + ' — ' + esc(ch.title) : '') + (se ? ' · ' + esc(se.title) : '') + '</div></div>' +
        '<span class="xsmall muted">✍️ apri</span></div>';
    }).join('');
  }

  /* ================================================================ LUOGHI */
  MCW.views.locations = {
    render: function (p) {
      if (p && p.id) return MCW.views.locationDetail.render(p);
      var all = DB.list('locations');
      var today = 'all';
      var h = '<div class="viewhead"><div><h1>🌍 Luoghi</h1><div class="sub">' + all.length + ' luoghi nel mondo della serie</div></div>' +
        '<div class="spacer"></div><div class="row tight">' +
        '<button class="btn primary" data-act="new-location">+ Nuovo luogo</button></div></div>';
      if (!all.length) return { html: h + '<div class="empty"><span class="big">🌍</span>Nessun luogo. Crea il primo (un villaggio, un castello, una dimensione…).</div>' };
      E.locationCategory.forEach(function (cat) {
        var list = all.filter(function (l) { return l.category === cat; });
        if (!list.length) return;
        h += '<div class="section-title">' + esc(cat) + ' <span class="pill ghost">' + list.length + '</span></div>' +
          '<div class="card-grid">' + list.map(function (l) {
            return '<div class="card hover" data-go="#/locations/' + l.id + '">' +
              (l.image ? '<img class="cover" src="' + esc(l.image) + '" alt="" />' : '') +
              '<strong>' + esc(l.name) + '</strong>' +
              '<div class="xsmall muted">' + esc(l.position || '') + '</div>' +
              '<div class="xsmall muted" style="margin-top:6px">' + esc(MCW.excerpt(l.description, 90)) + '</div>' +
              '<div class="row tight" style="margin-top:8px">' +
              '<span class="pill ghost">👥 ' + ((l.characterIds || []).length) + '</span>' +
              '<span class="pill ghost">⚔️ ' + DB.list('events').filter(function (e) { return e.locationId === l.id; }).length + '</span>' +
              '<span class="pill ghost">🧩 ' + DB.list('sections').filter(function (s) { return s.locationId === l.id; }).length + '</span>' +
              '</div></div>';
          }).join('') + '</div>';
      });
      var uncat = all.filter(function (l) { return !l.category || E.locationCategory.indexOf(l.category) < 0; });
      if (uncat.length) h += '<div class="section-title">Senza categoria</div><div class="card-grid">' + uncat.map(function (l) {
        return '<div class="card hover" data-go="#/locations/' + l.id + '"><strong>' + esc(l.name) + '</strong></div>';
      }).join('') + '</div>';
      return { html: h };
    }
  };

  MCW.views.locationDetail = {
    render: function (p) {
      var l = DB.get('locations', p.id);
      if (!l) return { html: '<div class="empty">Luogo non trovato. <button class="btn sm" data-go="#/locations">Torna ai luoghi</button></div>' };
      var evs = DB.list('events').filter(function (e) { return e.locationId === l.id; });
      var chaps = {};
      MCW.sectionsOf && DB.list('sections').forEach(function (s) { if (s.locationId === l.id && s.chapterId) chaps[s.chapterId] = true; });
      DB.list('scenes').forEach(function (s) { if (s.locationId === l.id && s.chapterId) chaps[s.chapterId] = true; });
      evs.forEach(function (e) { if (e.chapterId) chaps[e.chapterId] = true; });

      var h = '<div class="viewhead"><div><div class="xsmall muted"><span data-go="#/locations" style="cursor:pointer">🌍 Luoghi</span> / ' + esc(l.name) + '</div>' +
        '<h1>' + esc(l.name) + '</h1><div class="row tight" style="margin-top:6px">' + ui.pill(l.category) +
        (l.position ? '<span class="pill ghost">📍 ' + esc(l.position) + '</span>' : '') + '</div></div>' +
        '<div class="spacer"></div><button class="btn ghost" data-act="delete-entity" data-kind="locations" data-id="' + l.id + '">🗑️ Elimina</button></div>';

      h += '<div class="card" style="margin-bottom:14px">' +
        ui.field({ k: 'name', label: 'Nome', value: l.name }) +
        ui.field({ k: 'category', label: 'Categoria', type: 'select', value: l.category, options: E.locationCategory }) +
        ui.field({ k: 'position', label: 'Posizione', value: l.position }) +
        ui.field({ k: 'image', label: 'Immagine', type: 'image', value: l.image }) +
        ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 3, value: l.description }) +
        '<div class="grid c2">' + ui.field({ k: 'inhabitants', label: 'Abitanti', value: l.inhabitants }) +
        ui.field({ k: 'faction', label: 'Fazione', value: l.faction }) + '</div>' +
        '<div class="field"><label class="f">Personaggi collegati</label>' + ui.pickerHTML('characters', l.characterIds || []) + '</div>' +
        ui.field({ k: 'secrets', label: 'Segreti', type: 'textarea', rows: 2, value: l.secrets }) +
        ui.field({ k: 'notes', label: 'Note dell\'autore', type: 'textarea', rows: 2, value: l.notes }) +
        '</div>';

      h += '<div class="field"><label class="f">Eventi avvenuti qui</label>' +
        (evs.length ? '<div class="list">' + evs.map(function (e) {
          return '<div class="list-row" data-open="events" data-id="' + e.id + '"><span>⚔️</span><div style="flex:1"><strong class="small">' + esc(e.title) + '</strong>' +
            '<div class="xsmall muted">' + esc(MCW.excerpt(e.description, 90)) + '</div></div></div>';
        }).join('') + '</div>' : '<span class="muted small">—</span>') + '</div>';
      h += '<div class="field"><label class="f">Capitoli collegati</label>' +
        (Object.keys(chaps).length ? '<div class="row tight">' + Object.keys(chaps).map(function (id) { return ui.chip('chapters', id); }).join(' ') + '</div>' : '<span class="muted small">—</span>') + '</div>';

      return {
        html: h,
        mount: function (root) {
          ui.bindForm(root);
          var timer = null;
          root.querySelectorAll('.card [data-field]').forEach(function (el) {
            var ev = (el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input';
            el.addEventListener(ev, function () {
              clearTimeout(timer);
              timer = setTimeout(function () {
                var f = ui.readForm(root.querySelector('.card'));
                f.characterIds = ui.readPicker(root, 'characters') || [];
                DB.updateSilent('locations', l.id, f);
                MCW.flush();
              }, 450);
            });
          });
          var pkL = root.querySelector('[data-picker=characters]');
          if (pkL) pkL.addEventListener('change', function () {
            DB.updateSilent('locations', l.id, { characterIds: ui.readPicker(root, 'characters') || [] });
            MCW.flush();
          });
        }
      };
    }
  };

  /* =============================================================== OGGETTI */
  MCW.views.objects = {
    render: function (p) {
      if (p && p.id) {
        var o = DB.get('objects', p.id);
        if (!o) return { html: '<div class="empty">Oggetto non trovato. <button class="btn sm" data-go="#/objects">Torna agli oggetti</button></div>' };
        var h = '<div class="viewhead"><div><div class="xsmall muted"><span data-go="#/objects" style="cursor:pointer">🧩 Oggetti</span> / ' + esc(o.name) + '</div>' +
          '<h1>' + esc(o.name) + '</h1></div><div class="spacer"></div>' +
          '<button class="btn ghost" data-act="delete-entity" data-kind="objects" data-id="' + o.id + '">🗑️ Elimina</button></div>' +
          '<div class="card">' + ui.field({ k: 'name', label: 'Nome', value: o.name }) +
          ui.field({ k: 'category', label: 'Categoria', type: 'select', value: o.category, options: E.objectCategory }) +
          ui.field({ k: 'image', label: 'Immagine', type: 'image', value: o.image }) +
          ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 3, value: o.description }) +
          ui.field({ k: 'powers', label: 'Poteri / Effetti', type: 'textarea', rows: 2, value: o.powers }) +
          ui.field({ k: 'origin', label: 'Origine', value: o.origin }) +
          '<div class="field"><label class="f">Proprietari / Portatori</label>' + ui.pickerHTML('characters', o.ownerIds || []) + '</div>' +
          '<div class="field"><label class="f">Luogo collegato</label><select data-field="locationId"><option value="">— nessuno —</option>' +
          DB.list('locations').map(function (l2) { return '<option value="' + l2.id + '"' + (o.locationId === l2.id ? ' selected' : '') + '>' + esc(l2.name) + '</option>'; }).join('') + '</select></div>' +
          ui.field({ k: 'notes', label: 'Note', type: 'textarea', rows: 2, value: o.notes }) + '</div>';
        return {
          html: h,
          mount: function (root) {
            ui.bindForm(root);
            var timer = null;
            root.querySelectorAll('.card [data-field]').forEach(function (el) {
              el.addEventListener((el.tagName === 'SELECT') ? 'change' : 'input', function () {
                clearTimeout(timer);
                timer = setTimeout(function () {
                  var f = ui.readForm(root.querySelector('.card'));
                  f.ownerIds = ui.readPicker(root, 'characters') || [];
                  if (!f.locationId) f.locationId = null;
                  DB.updateSilent('objects', o.id, f); MCW.flush();
                }, 450);
              });
            });
            var pkO = root.querySelector('[data-picker=characters]');
            if (pkO) pkO.addEventListener('change', function () {
              DB.updateSilent('objects', o.id, { ownerIds: ui.readPicker(root, 'characters') || [] }); MCW.flush();
            });
          }
        };
      }
      var all = DB.list('objects');
      var h2 = '<div class="viewhead"><div><h1>🧩 Oggetti</h1><div class="sub">' + all.length + ' oggetti, armi, artefatti e reliquie</div></div>' +
        '<div class="spacer"></div><button class="btn primary" data-act="new-object">+ Nuovo oggetto</button></div>';
      if (!all.length) return { html: h2 + '<div class="empty"><span class="big">🧩</span>Nessun oggetto ancora.</div>' };
      h2 += '<div class="card-grid">' + all.map(function (o) {
        return '<div class="card hover" data-go="#/objects/' + o.id + '">' +
          (o.image ? '<img class="cover" src="' + esc(o.image) + '" alt="" />' : '') +
          '<strong>' + esc(o.name) + '</strong> <span class="pill ghost">' + esc(o.category || '') + '</span>' +
          '<div class="xsmall muted" style="margin-top:6px">' + esc(MCW.excerpt(o.description, 90)) + '</div>' +
          '<div class="row tight" style="margin-top:8px">' + ((o.ownerIds || []).length ? o.ownerIds.map(function (id) { return ui.chip('characters', id); }).join(' ') : '') + '</div></div>';
      }).join('') + '</div>';
      return { html: h2 };
    }
  };

  /* --------------------------------------------------------- grafo relazioni */
  MCW.views.graph = function () {
    var chars = DB.list('characters');
    if (chars.length < 2) return { html: '<div class="empty">Servono almeno due personaggi per vedere il grafo.</div>' };
    var W = 860, H = 460, cx = W / 2, cy = H / 2, R = Math.min(W, H) / 2 - 70;
    var pos = {};
    chars.forEach(function (c, i) {
      var a = (i / chars.length) * Math.PI * 2 - Math.PI / 2;
      pos[c.id] = { x: cx + R * Math.cos(a), y: cy + R * Math.sin(a) };
    });
    var rels = DB.list('relations');
    var svg = '<svg viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Grafo delle relazioni">';
    rels.forEach(function (r) {
      var a = pos[r.fromId], b = pos[r.toId];
      if (!a || !b) return;
      var hostile = ['Nemico', 'Rivale', 'Manipolatore', 'Vittima'].indexOf(r.type) >= 0;
      svg += '<line class="glink" x1="' + a.x + '" y1="' + a.y + '" x2="' + b.x + '" y2="' + b.y + '" stroke="' + (hostile ? '#7c3f3a' : '#3f6b4c') + '" stroke-dasharray="' + (hostile ? '5 4' : '0') + '"/>' +
        '<text class="glabel" x="' + ((a.x + b.x) / 2) + '" y="' + ((a.y + b.y) / 2 - 4) + '">' + esc(r.type || '') + '</text>';
    });
    chars.forEach(function (c) {
      var pp = pos[c.id];
      var fill = c.alignment === 'Buono' ? '#1e2c22' : c.alignment === 'Cattivo' ? '#2c1d1c' : '#232a25';
      var stroke = c.alignment === 'Buono' ? '#4d8f5e' : c.alignment === 'Cattivo' ? '#8f4d4d' : '#5d6b62';
      svg += '<g class="gnode" data-open="characters" data-id="' + c.id + '">' +
        '<circle cx="' + pp.x + '" cy="' + pp.y + '" r="' + (c.role === 'Protagonista' || c.role === 'Antagonista' ? 26 : 20) + '" fill="' + fill + '" stroke="' + stroke + '"/>' +
        '<text x="' + pp.x + '" y="' + (pp.y + 4) + '" font-size="11">' + esc(ui.initials(c.name)) + '</text>' +
        '<text x="' + pp.x + '" y="' + (pp.y + (c.role === 'Protagonista' || c.role === 'Antagonista' ? 42 : 36)) + '">' + esc(c.name) + '</text></g>';
    });
    svg += '</svg>';
    var h = '<div class="viewhead"><div><h1>🔗 Relazioni</h1><div class="sub">' + rels.length + ' relazioni tra ' + chars.length +
      ' personaggi. Linee continue = alleanze, tratteggiate = conflitti.</div></div><div class="spacer"></div>' +
      '<button class="btn ghost" data-go="#/characters">← Elenco personaggi</button></div>' +
      '<div class="graph-wrap">' + svg + '</div>' +
      '<div class="section-title">Elenco relazioni</div>' +
      '<div class="list">' + rels.map(function (r) {
        var a = DB.get('characters', r.fromId), b = DB.get('characters', r.toId);
        return '<div class="list-row"><span>🔗</span><div style="flex:1"><strong class="small">' + esc(a ? a.name : '?') + ' → ' + esc(b ? b.name : '?') + '</strong>' +
          ' <span class="pill role">' + esc(r.type) + '</span><div class="xsmall muted">' + esc(r.description || '') + '</div></div>' +
          '<button class="btn sm ghost" data-act="del-relation" data-id="' + r.id + '">🗑️</button></div>';
      }).join('') + '</div>';
    return { html: h };
  };

  function stat(icon, k, v, x) {
    return '<div class="stat"><div class="k">' + icon + ' ' + esc(k) + '</div>' +
      (typeof v === 'number' ? '<div class="v">' + nf(v) + '</div>' : '<div class="v" style="font-size:16px">' + esc(v) + '</div>') +
      '<div class="x">' + esc(x || '') + '</div></div>';
  }
})(typeof globalThis !== 'undefined' ? globalThis : this);
