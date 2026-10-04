/* ==========================================================================
   views-extras.js — Eventi, Timeline automatica, Idee, Note (Da sistemare),
   Ricerca globale.
   ========================================================================== */
(function (global) {
  'use strict';
  var MCW = global.MCW; if (!MCW) return;
  var DB = MCW.DB, esc = MCW.esc, nf = MCW.nf, E = MCW.ENUM;
  var ui = MCW.ui;

  /* ================================================================ EVENTI */
  MCW.views.events = {
    render: function (p) {
      if (p && p.id) return eventDetail(p);
      var all = DB.list('events').slice().sort(function (a, b) {
        var ca = a.chapterId ? (DB.get('chapters', a.chapterId) || {}).number : 999;
        var cb = b.chapterId ? (DB.get('chapters', b.chapterId) || {}).number : 999;
        if (ca !== cb) return (ca || 999) - (cb || 999);
        return (a.order || 0) - (b.order || 0);
      });
      var h = '<div class="viewhead"><div><h1>⚔️ Eventi</h1><div class="sub">' + all.length + ' eventi · usati anche per costruire la timeline</div></div>' +
        '<div class="spacer"></div><div class="row tight">' +
        '<button class="btn ghost" data-go="#/timeline">🕐 Timeline</button>' +
        '<button class="btn primary" data-act="new-event">+ Nuovo evento</button></div></div>';
      if (!all.length) return { html: h + '<div class="empty"><span class="big">⚔️</span>Nessun evento. Gli eventi alimentano la timeline automatica.</div>' };
      h += '<div class="card-grid">' + all.map(function (e) {
        var ch = e.chapterId ? DB.get('chapters', e.chapterId) : null;
        var loc = e.locationId ? DB.get('locations', e.locationId) : null;
        return '<div class="card hover" data-go="#/events/' + e.id + '">' +
          '<div class="row tight"><strong>' + esc(e.title || 'Evento') + '</strong>' + (e.milestone ? '<span class="pill amb">★</span>' : '') + '</div>' +
          '<div class="xsmall muted">' + (ch ? 'Cap. ' + (ch.number || '?') + ' — ' + esc(ch.title) : 'Nessun capitolo') +
          (loc ? ' · 📍 ' + esc(loc.name) : '') + '</div>' +
          '<div class="xsmall muted" style="margin-top:6px">' + esc(MCW.excerpt(e.description, 100)) + '</div>' +
          (MCW.stripNotes(e.consequences) ? '' : '<div class="xsmall" style="color:#e0c78c;margin-top:6px">⚠️ Nessuna conseguenza indicata</div>') +
          '<div class="row tight" style="margin-top:8px">' + ((e.characterIds || []).slice(0, 4).map(function (id) { return ui.chip('characters', id); }).join(' ')) + '</div></div>';
      }).join('') + '</div>';
      return { html: h };
    }
  };

  function eventDetail(p) {
    var e = DB.get('events', p.id);
    if (!e) return { html: '<div class="empty">Evento non trovato. <button class="btn sm" data-go="#/events">Torna agli eventi</button></div>' };
    var h = '<div class="viewhead"><div><div class="xsmall muted"><span data-go="#/events" style="cursor:pointer">⚔️ Eventi</span> / ' + esc(e.title) + '</div>' +
      '<h1>' + esc(e.title || 'Evento') + '</h1><div class="row tight" style="margin-top:6px">' +
      (e.milestone ? '<span class="pill amb">★ Pietra miliare</span>' : '') +
      (e.narrativeDate ? '<span class="pill ghost">🗓️ ' + esc(e.narrativeDate) + '</span>' : '') + '</div></div>' +
      '<div class="spacer"></div><div class="row tight">' +
      '<button class="btn ghost" data-act="delete-entity" data-kind="events" data-id="' + e.id + '">🗑️ Elimina</button></div></div>';

    var chSel = '<select data-field="chapterId"><option value="">— nessuno —</option>' +
      MCW.chaptersSorted().map(function (c) { return '<option value="' + c.id + '"' + (e.chapterId === c.id ? ' selected' : '') + '>Cap. ' + (c.number || '?') + ' — ' + esc(c.title) + '</option>'; }).join('') + '</select>';
    var secSel = '<select data-field="sectionId"><option value="">— nessuna —</option>' +
      DB.list('sections').filter(function (s) { return !e.chapterId || s.chapterId === e.chapterId; })
        .map(function (s) { return '<option value="' + s.id + '"' + (e.sectionId === s.id ? ' selected' : '') + '>' + esc(s.title) + '</option>'; }).join('') + '</select>';
    var scnSel = '<select data-field="sceneId"><option value="">— nessuna —</option>' +
      DB.list('scenes').filter(function (s) { return !e.sectionId || s.sectionId === e.sectionId; })
        .map(function (s) { return '<option value="' + s.id + '"' + (e.sceneId === s.id ? ' selected' : '') + '>' + esc(s.title) + '</option>'; }).join('') + '</select>';

    h += '<div class="card" style="margin-bottom:14px">' +
      ui.field({ k: 'title', label: 'Titolo', value: e.title }) +
      ui.field({ k: 'description', label: 'Descrizione', type: 'textarea', rows: 3, value: e.description }) +
      '<div class="grid c3"><div class="field"><label class="f">Capitolo</label>' + chSel + '</div>' +
      '<div class="field"><label class="f">Sezione</label>' + secSel + '</div>' +
      '<div class="field"><label class="f">Scena</label>' + scnSel + '</div></div>' +
      '<div class="grid c2">' + ui.field({ k: 'narrativeDate', label: 'Data narrativa', value: e.narrativeDate, ph: 'es. Giorno 12, inverno' }) +
      '<div class="field"><label class="f">Luogo</label><select data-field="locationId"><option value="">— nessuno —</option>' +
      DB.list('locations').map(function (l) { return '<option value="' + l.id + '"' + (e.locationId === l.id ? ' selected' : '') + '>' + esc(l.name) + '</option>'; }).join('') + '</select></div></div>' +
      '<label class="chk" style="margin-bottom:12px"><input type="checkbox" data-field="milestone"' + (e.milestone ? ' checked' : '') + ' /> ★ Pietra miliare (evidenziata nella timeline)</label>' +
      '<div class="field"><label class="f">Personaggi coinvolti</label>' + ui.pickerHTML('characters', e.characterIds || []) + '</div>' +
      ui.field({ k: 'consequences', label: 'Conseguenze', type: 'textarea', rows: 3, value: e.consequences }) +
      '<div class="grid c2"><div class="field"><label class="f">Eventi precedenti</label>' + ui.pickerHTML('events', e.prevIds || [], { ph: 'Filtra eventi…' }) + '</div>' +
      '<div class="field"><label class="f">Eventi successivi</label>' + ui.pickerHTML('events', e.nextIds || [], { ph: 'Filtra eventi…' }) + '</div></div>' +
      '</div>';

    h += '<div class="row tight">' +
      (e.chapterId ? '<button class="btn" data-go="#/chapters/' + e.chapterId + '">📖 Apri capitolo</button>' : '') +
      (e.sceneId ? '<button class="btn" data-go="#/writing/scene/' + e.sceneId + '">✍️ Apri scena collegata</button>' : '') +
      (e.sectionId ? '<button class="btn" data-go="#/writing/section/' + e.sectionId + '">🧩 Apri sezione</button>' : '') +
      '</div>';

    return {
      html: h,
      mount: function (root) {
        ui.bindForm(root);
        var timer = null;
        function save() {
          var f = ui.readForm(root.querySelector('.card'));
          f.characterIds = ui.readPicker(root, 'characters') || [];
          f.prevIds = (ui.readPicker(root, 'events') || []).filter(function (x) { return x !== e.id; });
          var boxes = root.querySelectorAll('[data-picker="events"]');
          if (boxes[1]) f.nextIds = Array.from(boxes[1].querySelectorAll('input[type=checkbox]')).filter(function (c) { return c.checked; }).map(function (c) { return c.value; }).filter(function (x) { return x !== e.id; });
          else f.nextIds = e.nextIds || [];
          if (!f.chapterId) f.chapterId = null;
          if (!f.sectionId) f.sectionId = null;
          if (!f.sceneId) f.sceneId = null;
          if (!f.locationId) f.locationId = null;
          DB.updateSilent('events', e.id, f);
          MCW.flush();
        }
        root.querySelectorAll('.card [data-field],[data-picker] input').forEach(function (el) {
          el.addEventListener((el.tagName === 'SELECT' || el.type === 'checkbox') ? 'change' : 'input', function () {
            clearTimeout(timer); timer = setTimeout(save, 400);
          });
        });
      }
    };
  }

  /* ============================================================== TIMELINE */
  MCW.views.timeline = {
    render: function () {
      var evs = DB.list('events').slice();
      var order = MCW.chaptersSorted().map(function (c) { return c.id; });
      evs.sort(function (a, b) {
        var ia = a.chapterId ? order.indexOf(a.chapterId) : 999, ib = b.chapterId ? order.indexOf(b.chapterId) : 999;
        if (ia !== ib) return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
        return (a.order || 0) - (b.order || 0);
      });
      var totalWords = nf(MCW.totalWords());

      var h = '<div class="viewhead"><div><h1>🕐 Timeline</h1><div class="sub">Costruita automaticamente dagli eventi e dai capitoli: ' +
        evs.length + ' eventi · ' + totalWords + ' parole scritte</div></div>' +
        '<div class="spacer"></div><div class="row tight">' +
        '<button class="btn" data-go="#/reading">📖 Leggi tutto</button>' +
        '<button class="btn primary" data-act="new-event">+ Nuovo evento</button></div></div>';

      if (!evs.length && !MCW.chaptersSorted().length) return { html: h + '<div class="empty"><span class="big">🕐</span>La timeline si costruisce dai tuoi eventi.</div>' };

      h += '<div class="tl">';
      h += '<div class="tl-node"><div class="list-row" data-go="#/chapters"><span>🏁</span><div style="flex:1"><strong>PROLOGO</strong>' +
        '<div class="xsmall muted">Inizio del progetto · ' + MCW.chaptersSorted().length + ' capitoli pianificati</div></div><span class="xsmall muted">apri →</span></div></div>';

      var used = {};
      var grouped = [];
      evs.forEach(function (e) {
        var key = e.chapterId || '__none__';
        if (!used[key]) { used[key] = { chapterId: e.chapterId || null, items: [] }; grouped.push(used[key]); }
        used[key].items.push(e);
      });
      MCW.chaptersSorted().forEach(function (c) {
        var key = c.id;
        if (!used[key]) grouped.push({ chapterId: c.id, items: [] });
      });
      grouped.sort(function (a, b) {
        var ia = a.chapterId ? order.indexOf(a.chapterId) : 999, ib = b.chapterId ? order.indexOf(b.chapterId) : 999;
        return (ia < 0 ? 999 : ia) - (ib < 0 ? 999 : ib);
      });

      grouped.forEach(function (g) {
        var ch = g.chapterId ? DB.get('chapters', g.chapterId) : null;
        h += '<div class="tl-node"><div class="list-row"' + (ch ? ' data-go="#/chapters/' + ch.id + '"' : '') + '>' +
          '<span>' + (ch ? '📖' : '❔') + '</span><div style="flex:1;min-width:0">' +
          '<strong>' + (ch ? 'Capitolo ' + (ch.number || '?') + ' — ' + esc(ch.title) : 'Eventi senza capitolo') + '</strong> ' +
          (ch ? ui.statusPill(ch.status) : '') +
          (ch ? '<div class="xsmall muted">' + nf(MCW.chapterWordCount(ch.id)) + ' parole · ' + MCW.sectionsOf(ch.id).length + ' sezioni</div>' : '') +
          (ch ? '<div class="xsmall muted">' + esc(MCW.excerpt(ch.description, 110)) + '</div>' : '') +
          '</div><span class="xsmall muted">' + (ch ? 'apri →' : '') + '</span></div>';
        if (g.items.length) {
          h += '<div class="t-items" style="margin:8px 0 0 16px;border-left:1px solid var(--line-soft);padding-left:10px;display:flex;flex-direction:column;gap:7px">';
          g.items.forEach(function (e) {
            var loc = e.locationId ? DB.get('locations', e.locationId) : null;
            h += '<div class="list-row' + (e.milestone ? ' milestone' : '') + '" data-open="events" data-id="' + e.id + '">' +
              '<span>' + (e.milestone ? '★' : '⚔️') + '</span><div style="flex:1;min-width:0">' +
              '<strong class="small">' + esc(e.title) + '</strong>' +
              (e.narrativeDate ? ' <span class="pill ghost">' + esc(e.narrativeDate) + '</span>' : '') +
              '<div class="xsmall muted">' + esc(MCW.excerpt(e.description, 110)) + '</div>' +
              '<div class="xsmall muted">' + (loc ? '📍 ' + esc(loc.name) + ' · ' : '') +
              (e.characterIds || []).map(function (id) { var c = DB.get('characters', id); return c ? esc(c.name) : null; }).filter(Boolean).join(', ') + '</div>' +
              '</div>' +
              (e.sceneId ? '<button class="btn sm ghost" data-go="#/writing/scene/' + e.sceneId + '">✍️ scena</button>' : '') +
              '<button class="btn sm ghost" data-go="#/events/' + e.id + '">apri</button></div>';
          });
          h += '</div>';
        }
        h += '</div>';
      });
      h += '</div>';
      return { html: h };
    }
  };

  /* ================================================================= IDEE */
  MCW.views.ideas = {
    render: function (p) {
      var all = DB.list('ideas').slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      var open = all.filter(function (i) { return i.status !== 'sviluppata'; });
      var done = all.filter(function (i) { return i.status === 'sviluppata'; });
      var h = '<div class="viewhead"><div><h1>💡 Idee</h1><div class="sub">' + open.length + ' da sviluppare · ' + done.length + ' sviluppate</div></div>' +
        '<div class="spacer"></div><button class="btn primary" data-act="quick-idea">+ IDEA</button></div>';

      h += '<div class="card" style="margin-bottom:16px"><label class="f">Nuova idea — salvata immediatamente</label>' +
        '<textarea id="ideaText" rows="2" placeholder="Far incontrare Shadow e Kokushibo nel Nether."></textarea>' +
        '<div class="row tight" style="margin-top:9px">' +
        '<select id="ideaCat" style="max-width:200px">' + E.ideaCategory.map(function (c) { return '<option>' + esc(c) + '</option>'; }).join('') + '</select>' +
        '<button class="btn primary sm" data-act="add-idea">Salva idea</button></div></div>';

      function rows(list, title, icon) {
        if (!list.length) return '<div class="section-title">' + icon + ' ' + title + '</div><div class="empty small">Niente qui.</div>';
        return '<div class="section-title">' + icon + ' ' + title + ' <span class="pill ghost">' + list.length + '</span></div>' +
          '<div class="list">' + list.map(function (i) {
            return '<div class="card" style="padding:11px 12px;margin-bottom:8px">' +
              '<div class="row tight" style="margin-bottom:6px"><span class="pill amb">' + esc(i.category || 'Idea') + '</span>' +
              '<span class="xsmall muted">' + MCW.humanDate(i.createdAt) + '</span><span class="spacer" style="flex:1"></span>' +
              '<button class="btn sm ghost" data-act="edit-idea" data-id="' + i.id + '">✏️</button>' +
              '<button class="btn sm ghost" data-act="del-idea" data-id="' + i.id + '">🗑️</button></div>' +
              '<div style="white-space:pre-wrap">' + esc(i.text) + '</div>' +
              '<div class="row tight" style="margin-top:9px">' +
              (i.status === 'sviluppata'
                ? '<span class="pill good">✓ sviluppata</span><button class="btn sm ghost" data-act="idea-toggle" data-id="' + i.id + '">Riapri</button>'
                : '<button class="btn sm primary" data-act="convert-idea" data-id="' + i.id + '" data-target="scene">→ Scena</button>' +
                '<button class="btn sm" data-act="convert-idea" data-id="' + i.id + '" data-target="event">→ Evento</button>' +
                '<button class="btn sm" data-act="convert-idea" data-id="' + i.id + '" data-target="chapter">→ Capitolo</button>' +
                '<button class="btn sm" data-act="convert-idea" data-id="' + i.id + '" data-target="character">→ Personaggio</button>' +
                '<button class="btn sm" data-act="convert-idea" data-id="' + i.id + '" data-target="location">→ Luogo</button>' +
                '<button class="btn sm ghost" data-act="idea-toggle" data-id="' + i.id + '">Segna sviluppata</button>') +
              '</div></div>';
          }).join('') + '</div>';
      }
      h += rows(open, 'Da sviluppare', '💡') + rows(done, 'Sviluppate', '✓');
      return {
        html: h,
        mount: function (root) {
          var ta = root.querySelector('#ideaText');
          if (ta) {
            ta.onkeydown = function (e) { if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') MCW.actions['add-idea'](root, null); };
            if (MCW._pendingIdeaText) { ta.value = MCW._pendingIdeaText; MCW._pendingIdeaText = null; ta.focus(); }
          }
        }
      };
    }
  };

  /* ================================================================= NOTE */
  MCW.views.notes = {
    render: function (p) {
      var all = DB.list('notes').slice().sort(function (a, b) { return new Date(b.createdAt) - new Date(a.createdAt); });
      var open = all.filter(function (n) { return n.status !== 'risolta'; });
      var resolved = all.filter(function (n) { return n.status === 'risolta'; });
      var h = '<div class="viewhead"><div><h1>📝 Note e Da sistemare</h1>' +
        '<div class="sub">' + open.length + ' note aperte · ' + resolved.length + ' risolte. Le note non appaiono mai in modalità lettura.</div></div>' +
        '<div class="spacer"></div><div class="row tight"><button class="btn ghost" data-act="new-note">+ Nota libera</button></div></div>';

      h += '<div class="card" style="margin-bottom:16px"><label class="f">Nota rapida (salvata subito)</label>' +
        '<textarea id="noteText" rows="2" placeholder="[DA CONTROLLARE] La timeline ha un buco tra il capitolo 2 e il 3."></textarea>' +
        '<div class="row tight" style="margin-top:9px">' +
        '<select id="noteTag" style="max-width:260px">' + E.noteTag.map(function (t) { return '<option>[' + esc(t) + ']</option>'; }).join('') + '</select>' +
        '<select id="noteChapter" style="max-width:230px"><option value="">Nessun capitolo</option>' +
        MCW.chaptersSorted().map(function (c) { return '<option value="' + c.id + '">Cap. ' + (c.number || '?') + ' — ' + esc(c.title) + '</option>'; }).join('') + '</select>' +
        '<button class="btn primary sm" data-act="add-note">Aggiungi nota</button></div></div>';

      function block(list, title, empty) {
        if (!list.length) return '<div class="section-title">' + title + '</div><div class="empty small">' + empty + '</div>';
        return '<div class="section-title">' + title + ' <span class="pill ghost">' + list.length + '</span></div>' +
          '<div class="list">' + list.map(function (n) {
            var ch = n.chapterId ? DB.get('chapters', n.chapterId) : null;
            return '<div class="card" style="padding:11px 12px;margin-bottom:8px">' +
              '<div class="row tight" style="margin-bottom:6px"><span class="pill amb">' + esc(n.tag || 'NOTA') + '</span>' +
              (ch ? ui.chip('chapters', ch.id) : '') +
              (n.sceneId ? '<button class="btn sm ghost" data-go="#/writing/scene/' + n.sceneId + '">✍️ vai alla scena</button>' : '') +
              (n.sectionId && !n.sceneId ? '<button class="btn sm ghost" data-go="#/writing/section/' + n.sectionId + '">✍️ vai alla sezione</button>' : '') +
              '<span class="spacer" style="flex:1"></span><span class="xsmall muted">' + MCW.humanDate(n.createdAt) + '</span></div>' +
              '<div style="white-space:pre-wrap">' + esc(n.text) + '</div>' +
              '<div class="row tight" style="margin-top:9px">' +
              (n.status === 'risolta'
                ? '<span class="pill good">✓ risolta</span><button class="btn sm ghost" data-act="note-toggle" data-id="' + n.id + '">Riapri</button>'
                : '<button class="btn sm primary" data-act="note-toggle" data-id="' + n.id + '">✓ Segna come risolta</button>') +
              '<button class="btn sm ghost" data-act="edit-note" data-id="' + n.id + '">✏️</button>' +
              '<button class="btn sm ghost" data-act="del-note" data-id="' + n.id + '">🗑️</button></div></div>';
          }).join('') + '</div>';
      }
      h += block(open, 'DA SISTEMARE', 'Niente in sospeso. 🎉') + block(resolved, 'Risolte', 'Nessuna nota risolta.');
      return {
        html: h,
        mount: function (root) {
          if (MCW._pendingNote) { var ta = root.querySelector('#noteText'); if (ta) { ta.value = MCW._pendingNote; ta.focus(); } MCW._pendingNote = null; }
        }
      };
    }
  };

  /* ======================================================= RICERCA GLOBALE */
  MCW.views.search = {
    render: function (p) {
      var q = (p && p.q) || MCW._lastQuery || '';
      var res = MCW.searchAll(q);
      var h = '<div class="viewhead"><div><h1>🔎 Ricerca</h1>' +
        '<div class="sub">Cerca insieme in testo, capitoli, sezioni, scene, personaggi, luoghi, eventi, oggetti, idee, note e relazioni.</div></div></div>';
      h += '<div class="card" style="margin-bottom:14px"><input type="text" class="search-input" id="gsearch" value="' + esc(q) + '" placeholder="es. Kokushibo, Nether, primo incontro…" autofocus />' +
        (q ? '<div class="small muted" style="margin-top:8px">' + res.total + ' risultati per «' + esc(q) + '»</div>' :
          '<div class="small muted" style="margin-top:8px">Scrivi per cercare in tutto il progetto. <span class="kbd">Ctrl</span>+<span class="kbd">K</span> per aprire la ricerca in qualsiasi momento.</div>') + '</div>';
      if (q && !res.total) h += '<div class="empty"><span class="big">🫥</span>Nessun risultato per «' + esc(q) + '».</div>';
      res.groups.forEach(function (g) {
        h += '<div class="sr-group">' + g.icon + ' ' + esc(g.label) + ' · ' + g.rows.length + '</div>';
        h += g.rows.map(function (r) {
          return '<div class="sr" data-go="' + r.route + '"><span class="sr-ico">' + r.icon + '</span>' +
            '<div style="flex:1;min-width:0"><div class="sr-t">' + MCW.hi(r.title, q) + '</div>' +
            (r.sub ? '<div class="xsmall muted">' + MCW.hi(r.sub, q) + '</div>' : '') +
            '<div class="sr-s">' + MCW.hi(r.snippet, q) + '</div></div></div>';
        }).join('');
      });
      return {
        html: h,
        mount: function (root) {
          var inp = root.querySelector('#gsearch');
          if (!inp) return;
          if (mcw_shouldFocus()) inp.focus();
          inp.oninput = MCW.debounce(function () {
            MCW._lastQuery = inp.value;
            var res2 = MCW.searchAll(inp.value);
            // aggiorna inline senza perdere il focus
            var box = root.querySelector('.view');
            var target = inp.closest('.card').nextElementSibling;
            var html = '';
            if (inp.value && !res2.total) html = '<div class="empty"><span class="big">🫥</span>Nessun risultato per «' + esc(inp.value) + '».</div>';
            res2.groups.forEach(function (g) {
              html += '<div class="sr-group">' + g.icon + ' ' + esc(g.label) + ' · ' + g.rows.length + '</div>' +
                g.rows.map(function (r) {
                  return '<div class="sr" data-go="' + r.route + '"><span class="sr-ico">' + r.icon + '</span>' +
                    '<div style="flex:1;min-width:0"><div class="sr-t">' + MCW.hi(r.title, inp.value) + '</div>' +
                    (r.sub ? '<div class="xsmall muted">' + MCW.hi(r.sub, inp.value) + '</div>' : '') +
                    '<div class="sr-s">' + MCW.hi(r.snippet, inp.value) + '</div></div></div>';
                }).join('');
            });
            var holder = root.querySelector('#searchResults');
            if (holder) holder.innerHTML = html;
            else {
              var div = document.createElement('div');
              div.id = 'searchResults';
              div.innerHTML = '<div class="sr-group">Risultati · ' + res2.total + '</div>' + html;
              inp.closest('.card').after(div);
              holder = div;
            }
            var cnt = inp.closest('.card').querySelector('.small.muted');
            if (cnt && inp.value) cnt.textContent = res2.total + ' risultati per «' + inp.value + '»';
          }, 220);
        }
      };
    }
  };
  function mcw_shouldFocus() { return global.innerWidth > 760; }
})(typeof globalThis !== 'undefined' ? globalThis : this);
