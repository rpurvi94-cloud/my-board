// =====================================================
//  FIREBASE INITIALIZATION & IMPORTS
// =====================================================
import { doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db } from "./firebase.js";
import { signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";

// ----- login check using your existing login page -----
const currentUser = localStorage.getItem('currentUser');
if (!currentUser) window.location.href = 'login.html';

// ----- the tabs. kind = what the tab holds -----
const BOARDS = [
  { k: 'ach',    name: 'My Achievements', tag: 'Things I am proud of',        kind: 'photos' },
  { k: 'want',   name: 'What I Want',     tag: 'Things I am working toward',    kind: 'photos' },
  { k: 'five',   name: 'After 5 Years',   tag: 'Where I see myself',            kind: 'photos' },
  { k: 'books',  name: 'Books',           tag: 'Books I have read',             kind: 'books'  },
  { k: 'tasks',  name: 'Tasks',           tag: 'Things to do, with reminders',  kind: 'tasks'  },
  { k: 'report', name: 'Daily Report',    tag: 'What I did each day for my goal', kind: 'report' },
  { k: 'webs',   name: 'Websites',        tag: 'Linked sites & extension data', kind: 'webs'   }
];
const KEYS = BOARDS.map(b => b.k);

const PIN_FIELDS = [
  { k: 'title',   label: 'Title',             type: 'text' },
  { k: 'date',    label: 'Date of the event', type: 'date' },
  { k: 'summary', label: 'Summary',           type: 'textarea' }
];
const BOOK_FIELDS = [
  { k: 'title',   label: 'Book name',                 type: 'text' },
  { k: 'author',  label: 'Author',                    type: 'text' },
  { k: 'date',    label: 'Date I finished it',        type: 'date' },
  { k: 'about',   label: 'About the book (from website)', type: 'textarea' },
  { k: 'summary', label: 'My summary',                type: 'textarea' }
];
const TASK_FIELDS = [
  { k: 'title',   label: 'Task',            type: 'text' },
  { k: 'date',    label: 'Task date',       type: 'date' },
  { k: 'remind',  label: 'Remind me at',    type: 'datetime-local' },
  { k: 'summary', label: 'Notes',           type: 'textarea' }
];
const WEB_FIELDS = [
  { k: 'title',   label: 'Website / Extension Name', type: 'text', req: true },
  { k: 'url',     label: 'Website or Extension URL', type: 'text', req: true },
  { k: 'summary', label: 'Notes / What I track here', type: 'textarea' }
];

const $ = s => document.querySelector(s);
let data = {};
KEYS.forEach(k => data[k] = []);
let cur = 'ach';

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const uid = () => Date.now() + Math.random();
const p2 = n => String(n).padStart(2, '0');

function fmt(d) {
  if (!d) return '';
  const x = new Date(d.length > 10 ? d : d + 'T00:00');
  return x.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function today() {
  const n = new Date();
  return n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate());
}
function toast(msg) {
  const container = $('#toasts');
  if (!container) return;
  const t = el('div', 'toast', msg);
  t.onclick = () => t.remove();
  container.append(t);
  setTimeout(() => t.remove(), 12000);
}

// =====================================================
//  FIRESTORE CLOUD SYNC (WITH LOCAL FALLBACK)
// =====================================================
async function loadAll() {
  try {
    const docRef = doc(db, "users", currentUser);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const cloudData = docSnap.data();
      KEYS.forEach(k => {
        if (cloudData[k]) data[k] = cloudData[k];
      });
    }
  } catch (err) {
    console.error("Cloud load failed, using local storage fallback:", err);
    // Fallback to localStorage if offline or rules block
    KEYS.forEach(k => {
      const localVal = localStorage.getItem('board_' + currentUser + '_' + k);
      if (localVal) {
        try { data[k] = JSON.parse(localVal); } catch (e) {}
      }
    });
  }
}

async function save(k) {
  // Always save locally first so it never loses data
  try {
    if (k) {
      localStorage.setItem('board_' + currentUser + '_' + k, JSON.stringify(data[k]));
    } else {
      KEYS.forEach(key => {
        localStorage.setItem('board_' + currentUser + '_' + key, JSON.stringify(data[key]));
      });
    }
  } catch (e) {}

  // Then try pushing to Firestore
  try {
    const docRef = doc(db, "users", currentUser);
    const payload = {};
    KEYS.forEach(key => {
      payload[key] = data[key];
    });
    await setDoc(docRef, payload, { merge: true });
  } catch (err) {
    console.error("Cloud save failed:", err);
  }
}

function shrink(file) {
  return new Promise(resolve => {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const k = Math.min(1, 900 / Math.max(img.width, img.height));
        const c = document.createElement('canvas');
        c.width = img.width * k;
        c.height = img.height * k;
        c.getContext('2d').drawImage(img, 0, 0, c.width, c.height);
        resolve(c.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = reader.result;
    };
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(file);
  });
}

const urlCache = new WeakMap();
function blobURL(b) {
  if (!urlCache.has(b)) urlCache.set(b, URL.createObjectURL(b));
  return urlCache.get(b);
}

// =====================================================
//  DETAILS POP-UP
// =====================================================
function editor(heading, fields, item, onSave, extra) {
  const dlgTitle = $('#dlgTitle');
  if (dlgTitle) dlgTitle.textContent = heading;
  
  const ex = $('#dlgExtra');
  if (ex) {
    ex.innerHTML = '';
    if (extra) extra(ex, item);
  }

  const f = $('#dlgFields');
  if (f) {
    f.innerHTML = '';
    fields.forEach(fd => {
      const lab = el('label', '', fd.label);
      lab.htmlFor = 'f_' + fd.k;
      const inp = document.createElement(fd.type === 'textarea' ? 'textarea' : 'input');
      if (fd.type === 'textarea') inp.rows = 5; else inp.type = fd.type;
      inp.id = 'f_' + fd.k;
      inp.required = !!fd.req;
      if (fd.min) inp.min = fd.min;
      inp.value = item[fd.k] || '';
      f.append(lab, inp);
    });
  }

  const dlgForm = $('#dlgForm');
  if (dlgForm) {
    dlgForm.onsubmit = e => {
      e.preventDefault();
      fields.forEach(fd => {
        const inputEl = $('#f_' + fd.k);
        if (inputEl) item[fd.k] = inputEl.value.trim();
      });
      const dlg = $('#dlg');
      if (dlg) dlg.close();
      onSave(item);
    };
  }
  const dlg = $('#dlg');
  if (dlg && typeof dlg.showModal === 'function') dlg.showModal();
}

const dlgCancel = $('#dlgCancel');
if (dlgCancel) {
  dlgCancel.onclick = () => {
    const dlg = $('#dlg');
    if (dlg) dlg.close();
  };
}

function removeItem(k, item, label) {
  const name = item.title || label;
  if (!confirm('Remove "' + name + '"? This cannot be undone.')) return;
  data[k] = data[k].filter(x => x !== item);
  save(k);
  render();
}

// =====================================================
//  PHOTOS + VIDEOS
// =====================================================
async function addFiles(list) {
  const k = cur, added = [];
  for (const f of list) {
    if (f.type.startsWith('image/')) {
      const src = await shrink(f);
      if (src) added.push({ id: uid(), type: 'image', src, title: '', date: '', summary: '' });
    } else if (f.type.startsWith('video/')) {
      if (f.size > 150 * 1024 * 1024) { toast('⚠ ' + f.name + ' is over 150 MB.'); continue; }
      added.push({ id: uid(), type: 'video', blob: f, title: f.name.replace(/\.[^.]+$/, ''), date: '', summary: '' });
    }
  }
  data[k] = [...added, ...data[k]];
  save(k);
  render();
  if (added.length === 1) editPin(added[0], k);
}

function editPin(p, k = cur) {
  editor('Details', PIN_FIELDS, { ...p }, d => { Object.assign(p, d); save(k); render(); });
}

function iconBtns(onEdit, onRemove) {
  const e = el('button', 'ib ed', '✎'); e.title = 'Edit details'; e.onclick = onEdit;
  const x = el('button', 'ib x', '✕');  x.title = 'Remove';       x.onclick = onRemove;
  return [e, x];
}

function details(it) {
  const b = el('div', 'body');
  if (it.title)   b.append(el('div', 'ttl', it.title));
  if (it.date)    b.append(el('div', 'date', '📅 ' + fmt(it.date)));
  if (it.summary) b.append(el('div', 'sum', it.summary));
  if (!b.children.length) b.append(el('div', 'ph', 'Press ✎ to add details.'));
  return b;
}

function pinCard(p) {
  const card = el('div', 'card');
  let media;
  if (p.type === 'video') {
    media = el('video');
    media.src = blobURL(p.blob);
    media.controls = true;
    media.preload = 'metadata';
    media.playsInline = true;
  } else if (p.type === 'yt') {
    media = el('div', 'yt');
    const i = el('img');
    i.src = 'https://img.youtube.com/vi/' + p.vid + '/hqdefault.jpg';
    i.alt = 'YouTube video';
    media.append(i);
    media.title = 'Open on YouTube';
    media.onclick = () => window.open('https://www.youtube.com/watch?v=' + p.vid, '_blank');
  } else {
    media = el('img', 'clk');
    media.src = p.src;
    media.alt = p.title || 'photo';
    media.onclick = () => openLB(p);
  }
  card.append(media, ...iconBtns(() => editPin(p), () => removeItem(cur, p, 'this item')), details(p));
  return card;
}

const addLinkBtn = $('#addLink');
if (addLinkBtn) {
  addLinkBtn.onclick = () => {
    const url = prompt('Paste a YouTube link:');
    if (!url) return;
    const m = url.match(/(?:youtu\.be\/|v=|embed\/|shorts\/)([\w-]{11})/);
    if (!m) return toast('⚠ That does not look like a YouTube link.');
    const p = { id: uid(), type: 'yt', vid: m[1], title: '', date: '', summary: '' };
    data[cur].unshift(p);
    save(cur);
    render();
    editPin(p);
  };
}

// =====================================================
//  BOOKS
// =====================================================
function bookExtra(ex, draft) {
  ex.innerHTML =
    '<label for="bq">Find the book online (optional)</label>' +
    '<div class="srch"><input id="bq" placeholder="Type book name"><button type="button" class="btn dark" id="bgo">Search</button></div>' +
    '<div id="bres"></div>' +
    '<label>Book cover</label><img id="bcov" alt="">' +
    '<button type="button" class="sm" id="bup">Upload photo</button>' +
    '<input type="file" id="bfile" accept="image/*" hidden>';

  const showCover = () => {
    const bcov = $('#bcov');
    if (bcov) {
      bcov.hidden = !draft.cover;
      if (draft.cover) bcov.src = draft.cover;
    }
  };
  showCover();

  const bup = $('#bup');
  if (bup) bup.onclick = () => $('#bfile').click();
  
  const bfile = $('#bfile');
  if (bfile) {
    bfile.onchange = async e => {
      const f = e.target.files[0];
      if (!f) return;
      const s = await shrink(f);
      if (s) { draft.cover = s; showCover(); }
    };
  }

  const bq = $('#bq');
  if (bq) bq.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); const bgo = $('#bgo'); if(bgo) bgo.click(); } };

  const bgo = $('#bgo');
  if (bgo) {
    bgo.onclick = async () => {
      const q = $('#bq').value.trim();
      if (!q) return;
      const res = $('#bres');
      if (res) res.textContent = 'Searching…';
      try {
        const r = await fetch('https://openlibrary.org/search.json?limit=5&fields=key,title,author_name,cover_i&q=' + encodeURIComponent(q));
        const j = await r.json();
        if (res) res.innerHTML = '';
        if (!j.docs || !j.docs.length) { if (res) res.textContent = 'No results.'; return; }
        j.docs.forEach(d => {
          const author = d.author_name ? d.author_name[0] : 'Unknown';
          const b = el('button', 'pick', d.title + ' — ' + author);
          b.type = 'button';
          b.onclick = async () => {
            draft.title = d.title;
            draft.author = author;
            if (d.cover_i) draft.cover = 'https://covers.openlibrary.org/b/id/' + d.cover_i + '-L.jpg';
            const ft = $('#f_title');
            const fa = $('#f_author');
            if (ft) ft.value = draft.title;
            if (fa) fa.value = draft.author;
            showCover();
            if (res) res.textContent = 'Filled in!';
          };
          if (res) res.append(b);
        });
      } catch (e) {
        const res = $('#bres');
        if (res) res.textContent = 'Could not reach Open Library.';
      }
    };
  }
}

function addBook() {
  const bk = { id: uid(), type: 'book', cover: '', title: '', author: '', date: '', about: '', summary: '' };
  editor('Add a book', BOOK_FIELDS, bk, d => { data.books.unshift(d); save('books'); render(); }, bookExtra);
}
function editBook(bk) {
  editor('Edit book', BOOK_FIELDS, { ...bk }, d => { Object.assign(bk, d); save('books'); render(); }, bookExtra);
}

function bookCard(bk) {
  const card = el('div', 'card');
  if (bk.cover) { const i = el('img'); i.src = bk.cover; i.alt = bk.title; card.append(i); }
  else card.append(el('div', 'nocover', '📖'));
  card.append(...iconBtns(() => editBook(bk), () => removeItem('books', bk, 'this book')));
  const b = el('div', 'body');
  b.append(el('div', 'ttl', bk.title || 'Untitled book'));
  if (bk.author) b.append(el('div', 'ph', bk.author));
  if (bk.date)   b.append(el('div', 'date', '✅ Finished ' + fmt(bk.date)));
  if (bk.summary)    b.append(el('div', 'sum', bk.summary));
  card.append(b);
  return card;
}

// =====================================================
//  TASKS
// =====================================================
function taskStatus(t) {
  if (t.done) return ['Done', 'ok'];
  if (!t.date) return null;
  const d = today();
  if (t.date < d)   return ['Overdue', 'over'];
  if (t.date === d) return ['Today', 'today'];
  return ['Upcoming', 'up'];
}

function calendarURL(t) {
  const f  = d => d.getFullYear() + p2(d.getMonth() + 1) + p2(d.getDate());
  const ft = d => f(d) + 'T' + p2(d.getHours()) + p2(d.getMinutes()) + '00';
  let dates = '';
  if (t.remind) {
    const s = new Date(t.remind), e = new Date(s.getTime() + 3600000);
    dates = ft(s) + '/' + ft(e);
  } else if (t.date) {
    const s = new Date(t.date + 'T00:00'), e = new Date(s.getTime() + 86400000);
    dates = f(s) + '/' + f(e);
  }
  return 'https://calendar.google.com/calendar/render?action=TEMPLATE&text=' + encodeURIComponent(t.title || 'Task') +
         (dates ? '&dates=' + dates : '') + '&details=' + encodeURIComponent(t.summary || '');
}

function addTask() {
  const t = { id: uid(), title: '', date: '', remind: '', summary: '', done: false, notified: false };
  editor('Add a task', TASK_FIELDS, t, d => { data.tasks.unshift(d); save('tasks'); render(); });
}
function editTask(t) {
  editor('Edit task', TASK_FIELDS, { ...t }, d => {
    Object.assign(t, d);
    save('tasks');
    render();
  });
}

function renderTasks() {
  const L = $('#list');
  if (!L) return;
  L.innerHTML = '';
  const ts = [...data.tasks].sort((a, b) =>
    (!!a.done - !!b.done) || ((a.date || '9999') < (b.date || '9999') ? -1 : 1));
  if (!ts.length) { L.append(el('div', 'empty', 'No tasks yet.')); return; }

  ts.forEach(t => {
    const row = el('div', 'task' + (t.done ? ' done' : ''));
    const cb = el('input');
    cb.type = 'checkbox';
    cb.checked = !!t.done;
    cb.onchange = () => { t.done = cb.checked; save('tasks'); render(); };

    const main = el('div', 'tmain');
    main.append(el('div', 'ttl', t.title || 'Untitled task'));
    const meta = el('div', 'tmeta');
    const st = taskStatus(t);
    if (st) meta.append(el('span', 'chip ' + st[1], st[0]));
    if (t.date) meta.append(el('span', '', fmt(t.date)));
    main.append(meta);
    if (t.summary) main.append(el('div', 'sum', t.summary));

    const act = el('div', 'tact');
    const cal = el('button', 'sm', '📅 Calendar'); cal.onclick = () => window.open(calendarURL(t), '_blank');
    const ed  = el('button', 'sm', 'Edit');         ed.onclick  = () => editTask(t);
    const rm  = el('button', 'sm', 'Remove');       rm.onclick  = () => removeItem('tasks', t, 'this task');
    act.append(cal, ed, rm);

    row.append(cb, main, act);
    L.append(row);
  });
}

// =====================================================
//  LINKED WEBSITES & EXTENSION TAB
// =====================================================
function addWebsite() {
  const w = { id: uid(), title: '', url: 'https://', summary: '', scraped: '' };
  editor('Link Website or Extension', WEB_FIELDS, w, d => {
    data.webs.unshift(d);
    save('webs');
    render();
  });
}
function editWebsite(w) {
  editor('Edit Website', WEB_FIELDS, { ...w }, d => {
    Object.assign(w, d);
    save('webs');
    render();
  });
}

function logWebsiteReport(w) {
  editor('Log Today\'s Report: ' + w.title, [
    { k: 'report', label: 'Paste stats or write today\'s summary from ' + w.title, type: 'textarea', req: true }
  ], { report: '' }, d => {
    if (!d.report) return;
    const entry = '📅 ' + fmt(today()) + ':\n' + d.report;
    w.scraped = w.scraped ? entry + '\n\n' + w.scraped : entry;
    save('webs');
    render();
    toast('✅ Report saved for ' + w.title);
  });
}

async function fetchWebsiteData(w) {
  if (w.url.startsWith('chrome-extension://') || w.url.startsWith('edge://')) {
    toast('⚠ Browser security blocks auto-fetching extension pages. Use "✍ Log Report" after checking your extension!');
    logWebsiteReport(w);
    return;
  }

  toast('Fetching data from ' + w.title + '…');
  try {
    const res = await fetch(`https://api.allorigins.win/get?url=${encodeURIComponent(w.url)}`);
    const json = await res.json();
    if (json && json.contents) {
      const parser = new DOMParser();
      const doc = parser.parseFromString(json.contents, 'text/html');
      const text = doc.body ? doc.body.innerText.replace(/\s+/g, ' ').trim().slice(0, 400) : 'Content found.';
      const entry = '🔄 Synced ' + new Date().toLocaleString() + ':\n' + text + '...';
      w.scraped = w.scraped ? entry + '\n\n' + w.scraped : entry;
      save('webs');
      render();
      toast('✅ Successfully fetched website summary!');
    } else {
      throw new Error('Empty');
    }
  } catch (err) {
    toast('⚠ Could not auto-fetch this site. Opening manual report log...');
    logWebsiteReport(w);
  }
}

function renderWebsites() {
  const L = $('#list');
  if (!L) return;
  L.innerHTML = '';
  const webs = data.webs;
  if (!webs.length) {
    L.append(el('div', 'empty', 'No websites linked yet. Press "+ Link website" to add Purrfect Pomodoro Timer or any other site.'));
    return;
  }

  webs.forEach(w => {
    const card = el('div', 'goal');
    card.append(el('h2', '', w.title || 'Untitled Website'));
    card.append(el('div', 'tmeta', w.url));
    if (w.summary) card.append(el('div', 'sum', w.summary));
    if (w.scraped) card.append(el('div', 'banner', w.scraped));

    const act = el('div', 'gact');
    const isExt = w.url.startsWith('chrome-extension://') || w.url.startsWith('edge://');

    const openBtn = el('button', 'btn', isExt ? '📋 Copy Extension Link' : '🌐 Open Site');
    openBtn.onclick = () => {
      if (isExt) {
        navigator.clipboard.writeText(w.url);
        toast('📋 Extension link copied! Open a new tab (+) and paste (Ctrl+V) to view it, then click "✍ Log Report".');
      } else {
        window.open(w.url, '_blank');
      }
    };

    const logBtn = el('button', 'btn dark', '✍ Log Today\'s Report');
    logBtn.onclick = () => logWebsiteReport(w);

    const fetchBtn = el('button', 'sm', '🔄 Auto-Fetch');
    fetchBtn.onclick = () => fetchWebsiteData(w);

    const edBtn = el('button', 'sm', 'Edit');
    edBtn.onclick = () => editWebsite(w);

    const rmBtn = el('button', 'sm', 'Remove');
    rmBtn.onclick = () => removeItem('webs', w, w.title);

    act.append(openBtn, logBtn, fetchBtn, edBtn, rmBtn);
    card.append(act);
    L.append(card);
  });
}

// =====================================================
//  DRAWING THE PAGE
// =====================================================
function drawTabs() {
  const t = $('#tabs');
  if (!t) return;
  t.innerHTML = '';
  BOARDS.forEach(b => {
    const count = (data[b.k] || []).length;
    const btn = el('button', 'tab' + (b.k === cur ? ' on' : ''), b.name + ' (' + count + ')');
    btn.onclick = () => { cur = b.k; location.hash = b.k; render(); };
    t.append(btn);
  });
}

function render() {
  const b = BOARDS.find(x => x.k === cur);
  if (!b) return;
  const items = data[cur] || [];
  
  const titleEl = $('#title');
  if (titleEl) titleEl.textContent = b.name;
  
  const tagEl = $('#tag');
  if (tagEl) tagEl.textContent = b.tag;
  
  const countEl = $('#count');
  if (countEl) countEl.textContent = items.length;

  drawTabs();

  const photos = b.kind === 'photos';
  const drop = $('#drop'); if (drop) drop.hidden = !photos;
  const play = $('#play'); if (play) play.hidden = !photos;
  const add = $('#add'); if (add) add.hidden = !photos;
  const addLink = $('#addLink'); if (addLink) addLink.hidden = !photos;
  const addBook = $('#addBook'); if (addBook) addBook.hidden = b.kind !== 'books';
  const addTask = $('#addTask'); if (addTask) addTask.hidden = b.kind !== 'tasks';
  const addGoal = $('#addGoal'); if (addGoal) addGoal.hidden = b.kind !== 'report';
  const addWeb = $('#addWeb'); if (addWeb) addWeb.hidden = b.kind !== 'webs';

  const listView = b.kind === 'tasks' || b.kind === 'report' || b.kind === 'webs';
  const grid = $('#grid'); if (grid) grid.hidden = listView;
  const list = $('#list'); if (list) list.hidden = !listView;

  if (b.kind === 'tasks')  { renderTasks();  return; }
  if (b.kind === 'report') { renderReport(); return; }
  if (b.kind === 'webs')   { renderWebsites(); return; }

  const g = $('#grid');
  if (!g) return;
  g.innerHTML = '';
  if (!items.length) {
    g.style.columns = '1';
    g.append(el('div', 'empty', photos ? 'This board is empty. Add photos or videos.' : 'No books yet.'));
    return;
  }
  g.style.columns = '';
  items.forEach(it => g.append(b.kind === 'books' ? bookCard(it) : pinCard(it)));
}

// ----- big photo view -----
function openLB(p) {
  const lbImg = $('#lbImg');
  if (lbImg) lbImg.src = p.src;
  const i = $('#lbInfo');
  if (i) {
    i.innerHTML = '';
    if (p.title)   i.append(el('strong', '', p.title));
    if (p.date)    i.append(el('div', 'date', '📅 ' + fmt(p.date)));
    if (p.summary) i.append(el('div', '', p.summary));
  }
  const lb = $('#lb');
  if (lb) lb.classList.add('on');
}
const lbEl = $('#lb');
if (lbEl) lbEl.onclick = () => lbEl.classList.remove('on');

// ----- buttons + drag and drop -----
const addBtn = $('#add');
if (addBtn) addBtn.onclick = () => { const f = $('#file'); if (f) f.click(); };

const fileInput = $('#file');
if (fileInput) fileInput.onchange = e => { addFiles(e.target.files); e.target.value = ''; };

const addBookBtn = $('#addBook');
if (addBookBtn) addBookBtn.onclick = addBook;

const addTaskBtn = $('#addTask');
if (addTaskBtn) addTaskBtn.onclick = addTask;

const addWebBtn = $('#addWeb');
if (addWebBtn) addWebBtn.onclick = addWebsite;

const dz = $('#drop');
const onPhotos = () => {
  const board = BOARDS.find(b => b.k === cur);
  return board ? board.kind === 'photos' : false;
};

['dragover', 'dragenter'].forEach(t =>
  document.addEventListener(t, e => { e.preventDefault(); if (onPhotos() && dz) dz.classList.add('over'); }));
['dragleave', 'drop'].forEach(t =>
  document.addEventListener(t, e => { e.preventDefault(); if (dz) dz.classList.remove('over'); }));
document.addEventListener('drop', e => {
  if (onPhotos() && e.dataTransfer && e.dataTransfer.files.length) addFiles(e.dataTransfer.files);
});

function fromHash() {
  const h = location.hash.slice(1);
  if (KEYS.includes(h)) cur = h;
}
window.addEventListener('hashchange', () => { fromHash(); render(); });

// =====================================================
//  BACKUP + RESTORE
// =====================================================
const blobToURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function exportData() {
  const out = {};
  for (const k of KEYS) {
    out[k] = [];
    for (const it of data[k]) {
      const c = { ...it };
      if (c.blob) { c.blobURL = await blobToURL(c.blob); delete c.blob; }
      out[k].push(c);
    }
  }
  return out;
}
async function importData(saved) {
  const out = {};
  for (const k of KEYS) {
    out[k] = [];
    for (const it of (saved[k] || [])) {
      const c = { ...it };
      if (c.blobURL) { c.blob = await (await fetch(c.blobURL)).blob(); delete c.blobURL; }
      out[k].push(c);
    }
  }
  data = out;
}

const backupBtn = $('#backup');
if (backupBtn) {
  backupBtn.onclick = async () => {
    toast('Preparing backup…');
    const text = JSON.stringify(await exportData());
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
    a.download = 'my-boards-backup-' + today() + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  };
}

const restoreBtn = $('#restore');
if (restoreBtn) restoreBtn.onclick = () => { const rf = $('#restoreFile'); if (rf) rf.click(); };

const restoreFileInput = $('#restoreFile');
if (restoreFileInput) {
  restoreFileInput.onchange = e => {
    const file = e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async () => {
      try {
        const saved = JSON.parse(reader.result);
        if (!confirm('Replace data with this backup?')) return;
        await importData(saved);
        save();
        render();
        toast('✅ Backup restored.');
      } catch (err) {
        toast('⚠ Invalid backup file.');
      }
    };
    reader.readAsText(file);
  };
}

// =====================================================
//  FULLSCREEN SLIDESHOW
// =====================================================
let ssList = [], ssI = 0, ssTimer = null, ssPlaying = true;

function ssShow() {
  const p = ssList[ssI];
  if (!p) return;
  const ssImg = $('#ssImg'); if (ssImg) ssImg.src = p.src;
  const ssCap = $('#ssCap'); if (ssCap) ssCap.textContent = p.title || '';
  const ssMeta = $('#ssMeta'); if (ssMeta) ssMeta.textContent = [p.date ? fmt(p.date) : '', p.summary || ''].filter(Boolean).join(' — ');
  const ssNum = $('#ssNum'); if (ssNum) ssNum.textContent = (ssI + 1) + ' / ' + ssList.length;
}
function ssGo(step) { ssI = (ssI + step + ssList.length) % ssList.length; ssShow(); }
function ssRestartTimer() {
  clearInterval(ssTimer);
  if (ssPlaying) ssTimer = setInterval(() => ssGo(1), 4000);
}
function ssClose() { clearInterval(ssTimer); const ss = $('#ss'); if (ss) ss.classList.remove('on'); }

const playBtn = $('#play');
if (playBtn) {
  playBtn.onclick = () => {
    ssList = (data[cur] || []).filter(p => !p.type || p.type === 'image');
    if (!ssList.length) { toast('Add some photos to this board first.'); return; }
    ssI = 0;
    ssPlaying = true;
    const ssPlay = $('#ssPlay'); if (ssPlay) ssPlay.textContent = '⏸ Pause';
    const ssTitle = $('#ssTitle'); 
    const board = BOARDS.find(b => b.k === cur);
    if (ssTitle && board) ssTitle.textContent = board.name;
    const ss = $('#ss'); if (ss) ss.classList.add('on');
    ssShow();
    ssRestartTimer();
  };
}

const ssNext = $('#ssNext'); if (ssNext) ssNext.onclick = () => { ssGo(1);  ssRestartTimer(); };
const ssPrev = $('#ssPrev'); if (ssPrev) ssPrev.onclick = () => { ssGo(-1); ssRestartTimer(); };
const ssCloseBtn = $('#ssClose'); if (ssCloseBtn) ssCloseBtn.onclick = ssClose;

const ssPlayBtn = $('#ssPlay');
if (ssPlayBtn) {
  ssPlayBtn.onclick = () => {
    ssPlaying = !ssPlaying;
    ssPlayBtn.textContent = ssPlaying ? '⏸ Pause' : '▶ Play';
    ssRestartTimer();
  };
}

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') { const lb = $('#lb'); if (lb) lb.classList.remove('on'); ssClose(); }
  const ss = $('#ss');
  if (!ss || !ss.classList.contains('on')) return;
  if (e.key === 'ArrowRight') { ssGo(1);  ssRestartTimer(); }
  if (e.key === 'ArrowLeft')  { ssGo(-1); ssRestartTimer(); }
  if (e.key === ' ') { e.preventDefault(); const ssPlay = $('#ssPlay'); if (ssPlay) ssPlay.click(); }
});

// ----- log out -----
const logoutBtn = $('#logout');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Firebase sign-out failed:", err);
      toast('Could not log out. Please try again.');
      return;
    }
    localStorage.removeItem('currentUser');
    window.location.href = 'login.html';
  };
}

// =====================================================
//  DAILY REPORT
// =====================================================
function dayStr(d) { return d.getFullYear() + '-' + p2(d.getMonth() + 1) + '-' + p2(d.getDate()); }
function addDays(str, n) {
  const d = new Date(str + 'T00:00');
  d.setDate(d.getDate() + n);
  return dayStr(d);
}

function addGoal() {
  const g = { id: uid(), title: '', start: today(), days: '30', entries: {}, ext: [] };
  editor('New tracker', [
    { k: 'title', label: 'My goal', type: 'text', req: true },
    { k: 'start', label: 'Start date', type: 'date', req: true },
    { k: 'days',  label: 'Days to track', type: 'number', req: true, min: '1' }
  ], g, d => {
    const n = parseInt(d.days, 10);
    if (!d.title || !d.start || !(n >= 1)) return;
    d.days = n;
    if (!data.report) data.report = [];
    data.report.unshift(d);
    save('report');
    render();
  });
}

function extendGoal(g) {
  editor('Extend time', [{ k: 'more', label: 'Add how many days?', type: 'number', req: true, min: '1' }], { more: '7' }, d => {
    const n = parseInt(d.more, 10);
    if (!(n >= 1)) return;
    g.days = Number(g.days) + n;
    g.ext = g.ext || [];
    g.ext.push({ on: today(), more: n });
    save('report');
    render();
    toast('✅ Extended by ' + n + ' days.');
  });
}

function logDay(g, day) {
  const old = g.entries && g.entries[day] ? g.entries[day].text : '';
  editor(fmt(day) + ': what did I do?', [{ k: 'text', label: 'What I did for my goal', type: 'textarea', req: true }], { text: old }, d => {
    if (!d.text) return;
    if (!g.entries) g.entries = {};
    g.entries[day] = { text: d.text, at: g.entries[day] ? g.entries[day].at : Date.now() };
    save('report');
    render();
  });
}

function renderReport() {
  const L = $('#list');
  if (!L) return;
  L.innerHTML = '';
  if (!data.report || !data.report.length) {
    L.append(el('div', 'empty', 'No tracker yet. Press "+ New tracker".'));
    return;
  }
  data.report.forEach(g => L.append(goalCard(g)));
}

function goalCard(g) {
  const t0 = today();
  const total = Number(g.days);
  const end = addDays(g.start, total - 1);
  const entries = g.entries || {};
  const logged = Object.keys(entries).filter(d => entries[d].text).length;

  let streak = 0;
  let d = entries[t0] ? t0 : addDays(t0, -1);
  while (entries[d] && d >= g.start) { streak++; d = addDays(d, -1); }

  const card = el('div', 'goal');
  card.append(el('h2', '', g.title));
  card.append(el('div', 'tmeta', fmt(g.start) + ' → ' + fmt(end) + ' · ' + total + ' days'));

  const bar = el('div', 'bar');
  const fill = el('div', 'fill');
  fill.style.width = Math.min(100, (logged / total) * 100) + '%';
  bar.append(fill);
  card.append(bar);
  card.append(el('div', 'tmeta', logged + ' of ' + total + ' days logged · 🔥 ' + streak + ' day streak'));

  const act = el('div', 'gact');
  if (t0 >= g.start && t0 <= end) {
    const w = el('button', 'btn', entries[t0] ? "✎ Edit today's report" : "✍ Write today's report");
    w.onclick = () => logDay(g, t0);
    act.append(w);
  }
  const ex = el('button', 'btn dark', '+ Extend time');
  ex.onclick = () => extendGoal(g);
  const rm = el('button', 'sm', 'Remove tracker');
  rm.onclick = () => {
    if (!confirm('Remove tracker?')) return;
    data.report = data.report.filter(x => x !== g);
    save('report');
    render();
  };
  act.append(ex, rm);
  card.append(act);

  const list = el('div', 'days');
  const last = t0 < end ? t0 : end;
  for (let day = last; day >= g.start; day = addDays(day, -1)) {
    const e = entries[day];
    const row = el('div', 'day');
    row.append(el('div', 'dd', fmt(day)));
    row.append(el('div', 'dt' + (e ? '' : ' none'), e ? e.text : 'No entry'));
    const b = el('button', 'sm', e ? 'Edit' : 'Write');
    b.onclick = () => logDay(g, day);
    row.append(b);
    list.append(row);
  }
  if (t0 >= g.start) card.append(list);
  return card;
}

const addGoalBtn = $('#addGoal');
if (addGoalBtn) addGoalBtn.onclick = addGoal;

// =====================================================
//  START APP
// =====================================================
(async () => {
  await loadAll();
  fromHash();
  render();
})();