// =====================================================
//  FIREBASE INITIALIZATION & IMPORTS
// =====================================================
import { deleteDoc, doc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js";
import { auth, db, storage } from "./firebase.js";
import {
  deleteUser,
  EmailAuthProvider,
  GoogleAuthProvider,
  onAuthStateChanged,
  reauthenticateWithCredential,
  reauthenticateWithPopup,
  signOut
} from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { deleteObject, getDownloadURL, listAll, ref, uploadBytes } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-storage.js";

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
  { k: 'webs',   name: 'Websites',        tag: 'Linked sites & extension data', kind: 'webs'   },
  { k: 'diary',  name: '📖 Personal Diary', tag: 'Locked private journal & tracker', kind: 'diary' }
];
const KEYS = BOARDS.map(b => b.k);
const ACHIEVEMENT_SOURCE_KEYS = new Set(['want', 'five']);

const PHOTO_FRAMES = [
  { value: 'deckled', label: 'Deckled Craft & Botanical Washi' },
  { value: 'leather', label: 'Stitched Leather & Vintage Twine' },
  { value: 'polaroid', label: 'Vintage Polaroid & Paperclip' },
  { value: 'filigree', label: 'Gilded Antique Filigree' },
  { value: 'wax', label: 'Embossed Wax Seal & Ribbon' },
  { value: 'garland', label: 'Hand-Drawn Inked Garland' },
  { value: 'lace', label: 'Boho Scallop & Crochet Lace' },
  { value: 'wildflowers', label: 'Pressed Wildflowers & Glassmorphism' },
  { value: 'kraft', label: "Sun-Bleached Kraft & Baker's Twine" },
  { value: 'stars', label: 'Whimsical Star & Constellation Embroidery' },
  { value: 'collage', label: 'Torn Scrapbook Collage & Stamps' },
  { value: 'watercolor', label: 'Aesthetic Hand-Painted Watercolor' }
];
const PIN_FIELDS = [
  { k: 'title',   label: 'Title',             type: 'text' },
  { k: 'date',    label: 'Date of the event', type: 'date' },
  { k: 'frame',   label: 'Photo border style', type: 'frame-picker', defaultValue: 'polaroid', options: PHOTO_FRAMES },
  { k: 'summary', label: 'Summary',           type: 'textarea' }
];
const BOOK_FIELDS = [
  { k: 'title',   label: 'Book name',                 type: 'text' },
  { k: 'author',  label: 'Author',                    type: 'text' },
  { k: 'started', label: 'Date I started reading',     type: 'date' },
  { k: 'date',    label: 'Date I finished it',        type: 'date' },
  { k: 'about',   label: 'About the book (from website)', type: 'textarea' },
  { k: 'summary', label: 'Key learnings',              type: 'textarea' }
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
let diaryMeta = { title: 'My Personal Diary', cover: '' };
let diaryVault = null;
let diaryCryptoKey = null;
let diaryKeyBytes = null;
let diaryUnlocked = false;
let diaryBookOpen = false;
let diaryPageIdx = 0;
let diarySaveQueue = Promise.resolve();
let diarySaveTimer = null;
let diarySaveWaiters = [];
let diarySaveFailureNotified = false;
let cur = 'home';
const photoOrders = new Map();
const expandedReportTrackers = new WeakSet();

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text !== undefined) e.textContent = text;
  return e;
}
const uid = () => Date.now() + Math.random();
const p2 = n => String(n).padStart(2, '0');
const isImagePin = item => !item.type || item.type === 'image';

function orderedPhotoItems(k, items) {
  const savedOrder = photoOrders.get(k);
  if (!savedOrder) return items;
  const remaining = new Set(items);
  const ordered = [];
  savedOrder.forEach(item => {
    if (remaining.delete(item)) ordered.push(item);
  });
  return ordered.concat(items.filter(item => remaining.has(item)));
}

function shufflePhotoBoard(k) {
  const items = data[k] || [];
  if (items.length < 2) return;
  const shuffled = items.slice();
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  photoOrders.set(k, shuffled);
  render();
}

function fmt(d) {
  if (!d) return '';
  const x = new Date(d.length > 10 ? d : d + 'T00:00');
  return x.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}
function fmtBookDate(d) {
  if (!d) return '';
  const x = new Date(d.length > 10 ? d : d + 'T00:00');
  if (Number.isNaN(x.getTime())) return d;
  return x.toLocaleDateString(undefined, { day: '2-digit', month: 'short', year: 'numeric' });
}
function today() {
  const n = new Date();
  return n.getFullYear() + '-' + p2(n.getMonth() + 1) + '-' + p2(n.getDate());
}
const diaryIterations = 310000;
function bytesToBase64(bytes) {
  const array = new Uint8Array(bytes);
  let binary = '';
  for (let offset = 0; offset < array.length; offset += 0x8000) {
    binary += String.fromCharCode(...array.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}
const base64ToBytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
function deriveDiaryKey(password, salt) {
  const cryptoApi = window.crypto && window.crypto.subtle;
  if (!cryptoApi) throw new Error('Secure browser encryption is unavailable.');
  return cryptoApi.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey'])
    .then(key => cryptoApi.deriveKey(
      { name: 'PBKDF2', salt, iterations: diaryIterations, hash: 'SHA-256' },
      key,
      { name: 'AES-GCM', length: 256 },
      false,
      ['encrypt', 'decrypt']
    ));
}
function normalizeRecoveryAnswer(answer) {
  return String(answer || '').trim().normalize('NFKC').toLocaleLowerCase().replace(/\s+/g, ' ');
}
async function wrapDiaryKey(rawKey, secret) {
  const salt = window.crypto.getRandomValues(new Uint8Array(16));
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const wrappingKey = await deriveDiaryKey(secret, salt);
  const ciphertext = await window.crypto.subtle.encrypt({ name: 'AES-GCM', iv }, wrappingKey, rawKey);
  return { salt: bytesToBase64(salt), iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(ciphertext)) };
}
async function unwrapDiaryKey(wrapped, secret) {
  const wrappingKey = await deriveDiaryKey(secret, base64ToBytes(wrapped.salt));
  const rawKey = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(wrapped.iv) },
    wrappingKey,
    base64ToBytes(wrapped.ciphertext)
  );
  return new Uint8Array(rawKey);
}
function importDiaryDataKey(rawKey) {
  return window.crypto.subtle.importKey('raw', rawKey, { name: 'AES-GCM' }, false, ['encrypt', 'decrypt']);
}
async function decryptDiaryPayload(key, iv, ciphertext) {
  const decrypted = await window.crypto.subtle.decrypt(
    { name: 'AES-GCM', iv: base64ToBytes(iv) },
    key,
    base64ToBytes(ciphertext)
  );
  const saved = JSON.parse(new TextDecoder().decode(decrypted));
  if (!saved || !Array.isArray(saved.pages)) throw new Error('Diary data is invalid.');
  return saved;
}
function restoreDiaryPayload(saved) {
  diaryMeta = { title: saved.title || 'My Personal Diary', cover: saved.cover || '' };
  data.diary = saved.pages;
}
async function encryptDiary() {
  const iv = window.crypto.getRandomValues(new Uint8Array(12));
  const plaintext = JSON.stringify({ ...diaryMeta, pages: data.diary });
  const encrypted = await window.crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    diaryCryptoKey,
    new TextEncoder().encode(plaintext)
  );
  return { ...diaryVault, iv: bytesToBase64(iv), ciphertext: bytesToBase64(encrypted) };
}
function clearDiaryMemory() {
  data.diary = [];
  diaryMeta = { title: 'My Personal Diary', cover: '' };
  diaryCryptoKey = null;
  diaryKeyBytes = null;
  diaryUnlocked = false;
  diaryBookOpen = false;
  diaryPageIdx = 0;
}
function toast(msg) {
  const container = $('#toasts');
  if (!container) return;
  const existing = [...container.children].find(item => item.textContent === msg);
  if (existing) {
    clearTimeout(existing.dismissTimer);
    existing.dismissTimer = setTimeout(() => existing.remove(), 12000);
    return;
  }
  const t = el('div', 'toast', msg);
  t.onclick = () => { clearTimeout(t.dismissTimer); t.remove(); };
  container.append(t);
  t.dismissTimer = setTimeout(() => t.remove(), 12000);
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
        if (k !== 'diary' && cloudData[k]) data[k] = cloudData[k];
      });
      diaryVault = cloudData.diaryVault || null;
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
    const savedVault = localStorage.getItem('board_' + currentUser + '_diaryVault');
    if (savedVault) {
      try { diaryVault = JSON.parse(savedVault); } catch (e) { console.error('Could not read the saved diary vault:', e); }
    }
  }
  if (!diaryVault) {
    const savedVault = localStorage.getItem('board_' + currentUser + '_diaryVault');
    if (savedVault) {
      try { diaryVault = JSON.parse(savedVault); } catch (e) { console.error('Could not read the saved diary vault:', e); }
    }
  }
}

function persistDiaryNow() {
  const waiters = diarySaveWaiters.splice(0);
  let locallySaved = false;
  diarySaveQueue = diarySaveQueue.then(async () => {
    if (!diaryUnlocked || !diaryCryptoKey || !diaryVault) return false;
    diaryVault = await encryptDiary();
    localStorage.setItem('board_' + currentUser + '_diaryVault', JSON.stringify(diaryVault));
    locallySaved = true;
    await setDoc(doc(db, "users", currentUser), { diary: [], diaryVault }, { merge: true });
    diarySaveFailureNotified = false;
    return true;
  }).catch(err => {
    console.error("Diary save failed:", err);
    if (!diarySaveFailureNotified) {
      const message = locallySaved
        ? err.code === 'permission-denied'
          ? 'Diary saved on this device, but Firebase denied sync. Check your sign-in and Firestore rules.'
          : 'Diary saved on this device, but could not sync. Check your connection and Firebase settings.'
        : 'Could not save the diary in browser storage. Free up storage and try again.';
      toast(message);
      diarySaveFailureNotified = true;
    }
    return false;
  });
  diarySaveQueue.then(result => waiters.forEach(resolve => resolve(result)));
  return diarySaveQueue;
}

function flushDiarySave() {
  if (diarySaveTimer !== null) {
    clearTimeout(diarySaveTimer);
    diarySaveTimer = null;
    return persistDiaryNow();
  }
  return diarySaveQueue;
}

async function save(k) {
  if (k === 'diary') {
    const pending = new Promise(resolve => diarySaveWaiters.push(resolve));
    if (diarySaveTimer !== null) clearTimeout(diarySaveTimer);
    diarySaveTimer = setTimeout(() => {
      diarySaveTimer = null;
      persistDiaryNow();
    }, 500);
    return pending;
  }

  // Always save locally first so it never loses data
  try {
    if (k) {
      localStorage.setItem('board_' + currentUser + '_' + k, JSON.stringify(k === 'diary' ? [] : data[k]));
    } else {
      KEYS.forEach(key => {
        localStorage.setItem('board_' + currentUser + '_' + key, JSON.stringify(key === 'diary' ? [] : data[key]));
      });
    }
    if (diaryVault) localStorage.setItem('board_' + currentUser + '_diaryVault', JSON.stringify(diaryVault));
  } catch (err) {
    console.error("Local save failed:", err);
    toast('Could not save locally. Browser storage may be full.');
  }

  // Then try pushing to Firestore
  try {
    const docRef = doc(db, "users", currentUser);
    const payload = {};
    KEYS.forEach(key => {
      payload[key] = key === 'diary' ? [] : data[key];
    });
    if (diaryVault && !k) payload.diaryVault = diaryVault;
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
      if (fd.type === 'textarea') {
        inp.rows = 5;
      } else if (fd.type === 'frame-picker') {
        inp.type = 'hidden';
      } else {
        inp.type = fd.type;
      }
      inp.id = 'f_' + fd.k;
      inp.required = !!fd.req;
      if (fd.min) inp.min = fd.min;
      inp.value = item[fd.k] || fd.defaultValue || '';

      if (fd.type === 'frame-picker') {
        const picker = el('div', 'frame-picker');
        picker.setAttribute('role', 'radiogroup');
        picker.setAttribute('aria-label', fd.label);
        (fd.options || []).forEach(option => {
          const choice = el('label', 'frame-choice');
          const radio = el('input', 'frame-choice-radio');
          radio.type = 'radio';
          radio.name = 'frame-choice';
          radio.value = option.value;
          radio.checked = inp.value === option.value;
          radio.setAttribute('aria-label', option.label);
          radio.onchange = () => { inp.value = option.value; };

          const preview = el('span', 'frame-preview-card frame-card frame-' + option.value);
          if (item.type === 'image' && item.src) {
            const image = el('img');
            image.src = item.src;
            image.alt = '';
            image.setAttribute('aria-hidden', 'true');
            preview.append(image);
          } else {
            preview.append(el('span', 'frame-preview-placeholder', item.type === 'video' ? '▶' : '✿'));
          }
          choice.append(radio, preview, el('span', 'frame-choice-name', option.label));
          picker.append(choice);
        });
        f.append(lab, picker, inp);
        return;
      }
      f.append(lab, inp);
    });
  }

  const dlgForm = $('#dlgForm');
  if (dlgForm) {
    dlgForm.onsubmit = e => {
      e.preventDefault();
      fields.forEach(fd => {
        const inputEl = $('#f_' + fd.k);
        if (inputEl) item[fd.k] = fd.trim === false ? inputEl.value : inputEl.value.trim();
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
  const b = el('div', 'body pinned-note');
  if (it.title)   b.append(el('div', 'ttl', it.title));
  if (it.date)    b.append(el('div', 'date', '📅 ' + fmt(it.date)));
  if (it.summary) b.append(el('div', 'sum', it.summary));
  if (!b.children.length) b.append(el('div', 'ph', 'Press ✎ to add details.'));
  return b;
}

function addPhotoToAchievements(p, sourceKey) {
  if (!ACHIEVEMENT_SOURCE_KEYS.has(sourceKey) || !isImagePin(p) || !(data[sourceKey] || []).includes(p)) return;
  data.ach = [{ ...p, id: uid() }, ...(data.ach || [])];
  photoOrders.delete('ach');
  save('ach');
  render();
  const sourceName = sourceKey === 'want' ? 'What I Want' : 'After 5 Years';
  toast('✅ Added photo to My Achievements. The original remains in ' + sourceName + '.');
}

function photoCardMenu(p, sourceKey) {
  const menu = el('details', 'card-more');
  const summary = el('summary', 'ib more', '⋮');
  summary.title = 'More options';
  summary.setAttribute('aria-label', 'More options');
  summary.setAttribute('aria-expanded', 'false');
  summary.onclick = () => {
    document.querySelectorAll('#grid .card-more[open]').forEach(other => {
      if (other !== menu) other.open = false;
    });
  };
  menu.addEventListener('toggle', () => summary.setAttribute('aria-expanded', String(menu.open)));

  const add = el('button', 'card-more-action', 'Add to My Achievements');
  add.type = 'button';
  add.onclick = event => {
    event.preventDefault();
    event.stopPropagation();
    menu.open = false;
    addPhotoToAchievements(p, sourceKey);
  };
  menu.append(summary, add);
  return menu;
}

document.addEventListener('click', event => {
  const target = event.target;
  if (!(target instanceof Element)) return;
  document.querySelectorAll('#grid .card-more[open]').forEach(menu => {
    if (!menu.contains(target)) menu.open = false;
  });
});

function pinCard(p) {
  const card = el('div', 'card');
  const frame = PHOTO_FRAMES.some(option => option.value === p.frame) ? p.frame : 'polaroid';
  card.classList.add('frame-card', 'frame-' + frame);
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
  card.append(media);
  card.append(...iconBtns(() => editPin(p), () => removeItem(cur, p, 'this item')));
  if (ACHIEVEMENT_SOURCE_KEYS.has(cur) && isImagePin(p)) card.append(photoCardMenu(p, cur));
  card.append(details(p));
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
  const bk = { id: uid(), type: 'book', cover: '', title: '', author: '', started: '', date: '', about: '', summary: '' };
  editor('Add a book', BOOK_FIELDS, bk, d => { data.books.unshift(d); save('books'); render(); }, bookExtra);
}
function editBook(bk) {
  editor('Edit book', BOOK_FIELDS, { ...bk }, d => { Object.assign(bk, d); save('books'); render(); }, bookExtra);
}

function bookCard(bk) {
  const card = el('article', 'card book-card');
  const cover = el('div', 'book-cover-wrap');
  if (bk.cover) {
    const image = el('img', 'book-cover');
    image.src = bk.cover;
    image.alt = (bk.title || 'Book') + ' cover';
    cover.append(image);
  } else {
    cover.append(el('div', 'book-cover-placeholder', '📖'));
  }

  const info = el('div', 'book-info');
  info.append(el('h2', 'book-title', bk.title || 'Untitled book'));
  if (bk.author) info.append(el('div', 'book-author', 'by ' + bk.author));
  const dates = el('div', 'book-dates');
  if (bk.started) dates.append(el('span', 'book-date', '▦ Started: ' + fmtBookDate(bk.started)));
  if (bk.started && bk.date) dates.append(el('span', 'book-date-arrow', '⟶'));
  if (bk.date) dates.append(el('span', 'book-date', '▦ Finished: ' + fmtBookDate(bk.date)));
  dates.append(el('span', 'book-status', 'Completed ✓'));
  info.append(dates);

  const learnings = el('section', 'book-learnings');
  learnings.append(el('h3', 'book-learnings-title', '✧ Key Learnings:'));
  const points = (bk.summary || '').split(/\r?\n/)
    .map(point => point.replace(/^\s*(?:[•·*-]\s*)+/, '').trim())
    .filter(Boolean);
  if (points.length) {
    const list = el('ul', 'book-learning-list');
    points.forEach(point => list.append(el('li', '', point)));
    learnings.append(list);
  } else {
    learnings.append(el('p', 'book-learning-empty', 'Add your learnings in Edit.'));
  }

  card.append(cover, info, el('div', 'book-divider'), learnings);
  card.append(...iconBtns(() => editBook(bk), () => removeItem('books', bk, 'this book')));
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
//  ENCRYPTED PERSONAL DIARY
// =====================================================
const DIARY_THEMES = [
  { id: 'vintage', label: '📜 Vintage' },
  { id: 'ruled', label: '📝 Ruler' },
  { id: 'cubic', label: '📐 Cubic' },
  { id: 'plain', label: '📄 Plain' }
];
const DIARY_FONTS = ['Georgia', 'Arial', 'Times New Roman', 'Courier New', 'Verdana'];

function cleanDiaryHtml(html) {
  const parsed = new DOMParser().parseFromString(html || '', 'text/html');
  const allowed = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'SUB', 'SUP', 'P', 'DIV', 'BR', 'UL', 'OL', 'LI', 'SPAN', 'FONT']);
  const cleanNode = node => {
    if (node.nodeType === Node.TEXT_NODE) return document.createTextNode(node.textContent);
    if (node.nodeType !== Node.ELEMENT_NODE) return document.createDocumentFragment();
    const tag = node.tagName;
    const children = [...node.childNodes].map(cleanNode);
    if (!allowed.has(tag)) {
      const fragment = document.createDocumentFragment();
      children.forEach(child => fragment.append(child));
      return fragment;
    }
    const result = document.createElement(tag.toLowerCase());
    children.forEach(child => result.append(child));
    if (tag === 'FONT') {
      const face = (node.getAttribute('face') || '').replace(/[^a-zA-Z ,'-]/g, '').trim();
      const color = node.getAttribute('color') || '';
      const size = Number(node.getAttribute('size'));
      if (DIARY_FONTS.includes(face)) result.setAttribute('face', face);
      if (/^#[0-9a-f]{6}$/i.test(color)) result.setAttribute('color', color);
      if (size >= 1 && size <= 7) result.setAttribute('size', String(size));
    }
    const style = node.style;
    if (tag === 'SPAN' && style) {
      const family = style.fontFamily.replace(/[";]/g, '').trim();
      const color = style.color;
      const fontSize = style.fontSize;
      if (DIARY_FONTS.includes(family)) result.style.fontFamily = family;
      if (/^#[0-9a-f]{6}$/i.test(color)) result.style.color = color;
      if (/^(8|9|1[0-9]|2[0-4])px$/.test(fontSize)) result.style.fontSize = fontSize;
    }
    return result;
  };
  const fragment = document.createDocumentFragment();
  [...parsed.body.childNodes].map(cleanNode).forEach(node => fragment.append(node));
  const container = document.createElement('div');
  container.append(fragment);
  return container.innerHTML;
}

function diaryPageHasContent(page) {
  const text = (page.html || '').replace(/<[^>]*>/g, '').trim();
  return !!((page.title || '').trim() || text || (page.media && page.media.length));
}

function diaryStats() {
  const dates = [...new Set(data.diary.filter(diaryPageHasContent).map(page => page.date))].sort();
  let streak = 0;
  let date = dates.includes(today()) ? today() : addDays(today(), -1);
  while (dates.includes(date)) {
    streak++;
    date = addDays(date, -1);
  }
  return { dates, streak };
}

function createOrOpenDiaryPage(date = today()) {
  let index = data.diary.findIndex(page => page.date === date);
  if (index < 0) {
    data.diary.push({ id: uid(), date, title: '', html: '', theme: 'vintage', media: [] });
    data.diary.sort((a, b) => a.date.localeCompare(b.date));
    index = data.diary.findIndex(page => page.date === date);
    save('diary');
  }
  diaryBookOpen = true;
  diaryPageIdx = index;
  render();
}

function turnDiaryPage(direction) {
  const next = diaryPageIdx + direction;
  if (next < 0) {
    diaryBookOpen = false;
    render();
    return;
  }
  if (next >= data.diary.length) return;
  const sheet = $('.diary-sheet');
  if (!sheet) {
    diaryPageIdx = next;
    render();
    return;
  }
  sheet.classList.add(direction > 0 ? 'flip-next' : 'flip-prev');
  setTimeout(() => {
    diaryPageIdx = next;
    render();
  }, 320);
}

function customizeDiaryCover() {
  const draft = { title: diaryMeta.title || 'My Personal Diary', cover: diaryMeta.cover || '' };
  editor('Customize Diary Cover', [
    { k: 'title', label: 'Diary title', type: 'text', req: true }
  ], draft, result => {
    diaryMeta.title = result.title;
    diaryMeta.cover = draft.cover;
    save('diary');
    render();
  }, (extra, value) => {
    const preview = el('img', 'diary-cover-preview');
    preview.alt = 'Diary cover preview';
    const uploadButton = el('button', 'sm', '📷 Upload cover photo');
    uploadButton.type = 'button';
    const clearButton = el('button', 'sm', 'Remove photo');
    clearButton.type = 'button';
    const file = el('input');
    file.type = 'file';
    file.accept = 'image/*';
    file.hidden = true;
    const sync = () => {
      preview.hidden = !value.cover;
      if (value.cover) preview.src = value.cover;
    };
    uploadButton.onclick = () => file.click();
    clearButton.onclick = () => { value.cover = ''; sync(); };
    file.onchange = async () => {
      const image = file.files[0];
      file.value = '';
      if (!image) return;
      value.cover = await shrink(image);
      sync();
    };
    extra.append(el('label', '', 'Cover photo (optional)'), preview, uploadButton, clearButton, file);
    sync();
  });
}

async function removeDiaryFile(path) {
  if (!path) return;
  try {
    await deleteObject(ref(storage, path));
  } catch (err) {
    console.error('Diary attachment cleanup failed:', err);
    toast('The diary entry was removed, but a stored attachment could not be deleted.');
  }
}

function diaryUploadErrorMessage(err) {
  switch (err.code) {
    case 'storage/unauthenticated':
      return 'Sign in again before adding diary attachments.';
    case 'storage/unauthorized':
      return 'Firebase Storage denied this upload. Check that Storage is enabled and its rules allow your signed-in account to write to users/{uid}/diary/.';
    case 'storage/bucket-not-found':
    case 'storage/project-not-found':
      return 'Firebase Storage could not find this project’s bucket. Enable Storage and verify storageBucket in firebase.js.';
    case 'storage/quota-exceeded':
      return 'Firebase Storage is over quota. Check your project’s Storage usage and billing settings.';
    case 'storage/retry-limit-exceeded':
    case 'storage/network-request-failed':
      return 'The upload was interrupted. Check your internet connection and try again.';
    default:
      return `The attachment upload failed${err.code ? ` (${err.code})` : ''}. Check the browser console for details.`;
  }
}

async function uploadDiaryFiles(files, type, button, page) {
  const selectedFiles = Array.from(files);
  if (!selectedFiles.length) return;

  button.disabled = true;
  const errors = [];
  let uploaded = 0;
  for (const [index, file] of selectedFiles.entries()) {
    if (type === 'video' && file.size > 100 * 1024 * 1024) {
      errors.push(new Error(`${file.name} is larger than the 100 MB video limit.`));
      continue;
    }
    if (file.type && !file.type.startsWith(`${type}/`)) {
      errors.push(new Error(`${file.name} is not a supported ${type} file.`));
      continue;
    }

    const path = `users/${currentUser}/diary/${page.id}/${Date.now()}-${index}-${file.name.replace(/[^a-zA-Z0-9._-]/g, '_')}`;
    try {
      const fileRef = ref(storage, path);
      await uploadBytes(fileRef, file, file.type ? { contentType: file.type } : {});
      page.media.push({
        type,
        src: await getDownloadURL(fileRef),
        storagePath: path,
        label: file.name
      });
      uploaded++;
    } catch (err) {
      console.error(`Diary ${type} upload failed for "${file.name}":`, err);
      errors.push(err);
    }
  }

  if (uploaded) {
    await save('diary');
    render();
  } else {
    button.disabled = false;
  }

  if (errors.length) {
    const firstError = errors[0];
    const message = firstError.code
      ? diaryUploadErrorMessage(firstError)
      : firstError.message;
    toast(uploaded
      ? `Added ${uploaded} of ${selectedFiles.length} attachments. ${message}`
      : message);
  }
}

async function unlockDiary(password, confirmation, question, answer) {
  if (!window.crypto || !window.crypto.subtle) {
    toast('Diary encryption needs a modern browser on HTTPS or localhost.');
    return;
  }
  if (!password) {
    toast('Enter your diary password.');
    return;
  }
  try {
    if (!diaryVault) {
      if (password.length < 8) {
        toast('Choose a diary password with at least 8 characters.');
        return;
      }
      if (password !== confirmation) {
        toast('The diary passwords do not match.');
        return;
      }
      const recoveryQuestion = String(question || '').trim();
      const recoveryAnswer = normalizeRecoveryAnswer(answer);
      if (!recoveryQuestion) {
        toast('Add a recovery question for your diary.');
        return;
      }
      if (recoveryAnswer.length < 8) {
        toast('Use a private recovery answer with at least 8 characters.');
        return;
      }
      diaryKeyBytes = window.crypto.getRandomValues(new Uint8Array(32));
      diaryCryptoKey = await importDiaryDataKey(diaryKeyBytes);
      const passwordWrap = await wrapDiaryKey(diaryKeyBytes, password);
      const recovery = {
        question: recoveryQuestion,
        ...await wrapDiaryKey(diaryKeyBytes, recoveryAnswer)
      };
      diaryVault = {
        version: 2,
        password: passwordWrap,
        recovery
      };
      diaryUnlocked = true;
      await save('diary');
      const stored = JSON.parse(localStorage.getItem('board_' + currentUser + '_diaryVault') || 'null');
      if (!stored || stored.version !== 2 || !stored.recovery || stored.recovery.ciphertext !== recovery.ciphertext) {
        diaryVault = null;
        clearDiaryMemory();
        render();
        toast('Could not save the encrypted diary on this device. Free up browser storage and try again.');
        return;
      }
      render();
      toast('Diary password and recovery question set.');
      return;
    }
    let key;
    let saved;
    if (diaryVault.version === 1) {
      key = await deriveDiaryKey(password, base64ToBytes(diaryVault.salt));
      saved = await decryptDiaryPayload(key, diaryVault.iv, diaryVault.ciphertext);
      diaryKeyBytes = null;
    } else if (diaryVault.version === 2 && diaryVault.password) {
      diaryKeyBytes = await unwrapDiaryKey(diaryVault.password, password);
      key = await importDiaryDataKey(diaryKeyBytes);
      saved = await decryptDiaryPayload(key, diaryVault.iv, diaryVault.ciphertext);
    } else {
      throw new Error('Unsupported diary format.');
    }
    diaryCryptoKey = key;
    restoreDiaryPayload(saved);
    diaryUnlocked = true;
    render();
    if (diaryVault.version === 1) {
      toast('Diary unlocked. Set a recovery question from the cover to protect future access.');
    }
  } catch (err) {
    diaryCryptoKey = null;
    diaryKeyBytes = null;
    console.error('Diary unlock failed:', err);
    toast('Could not unlock the diary. Check the password or your saved data.');
  }
}

async function recoverDiary(answer, newPassword, confirmation) {
  if (!diaryVault || diaryVault.version !== 2 || !diaryVault.recovery) {
    toast('Recovery is not set up for this diary.');
    return;
  }
  if (newPassword.length < 8) {
    toast('Choose a new diary password with at least 8 characters.');
    return;
  }
  if (newPassword !== confirmation) {
    toast('The new diary passwords do not match.');
    return;
  }
  const recoveryAnswer = normalizeRecoveryAnswer(answer);
  if (!recoveryAnswer) {
    toast('Enter your recovery answer.');
    return;
  }
  const previousVault = diaryVault;
  try {
    const rawKey = await unwrapDiaryKey(diaryVault.recovery, recoveryAnswer);
    const key = await importDiaryDataKey(rawKey);
    const saved = await decryptDiaryPayload(key, diaryVault.iv, diaryVault.ciphertext);
    const passwordWrap = await wrapDiaryKey(rawKey, newPassword);
    diaryKeyBytes = rawKey;
    diaryCryptoKey = key;
    diaryVault = { ...diaryVault, password: passwordWrap };
    restoreDiaryPayload(saved);
    diaryUnlocked = true;
    await save('diary');
    const stored = JSON.parse(localStorage.getItem('board_' + currentUser + '_diaryVault') || 'null');
    if (!stored || stored.version !== 2 || !stored.password || stored.password.ciphertext !== passwordWrap.ciphertext) {
      diaryVault = previousVault;
      clearDiaryMemory();
      render();
      toast('The new password could not be saved on this device. No password change was made.');
      return;
    }
    render();
    toast('Diary password reset. Your pages are safe.');
  } catch (err) {
    diaryVault = previousVault;
    clearDiaryMemory();
    render();
    console.error('Diary recovery failed:', err);
    toast('Could not reset the password. Check your recovery answer or saved diary data.');
  }
}

async function saveDiaryRecovery(details, migrateLegacy) {
  const question = details.question.trim();
  const answer = normalizeRecoveryAnswer(details.answer);
  if (!question) {
    toast('Add a recovery question for your diary.');
    return;
  }
  if (answer.length < 8) {
    toast('Use a private recovery answer with at least 8 characters.');
    return;
  }

  const previousVault = diaryVault;
  const previousKey = diaryCryptoKey;
  const previousKeyBytes = diaryKeyBytes;
  try {
    await flushDiarySave();
    let rawKey = diaryKeyBytes;
    let passwordWrap = diaryVault.password;
    if (migrateLegacy) {
      const currentPassword = details.currentPassword;
      if (!currentPassword) {
        toast('Enter your current diary password to add recovery.');
        return;
      }
      const currentKey = await deriveDiaryKey(currentPassword, base64ToBytes(diaryVault.salt));
      try {
        await decryptDiaryPayload(currentKey, diaryVault.iv, diaryVault.ciphertext);
      } catch {
        toast('Your current password did not unlock this diary. Nothing was changed.');
        return;
      }
      rawKey = window.crypto.getRandomValues(new Uint8Array(32));
      passwordWrap = await wrapDiaryKey(rawKey, currentPassword);
    }
    if (!rawKey) throw new Error('The unlocked diary key is unavailable.');

    const recovery = {
      question,
      ...await wrapDiaryKey(rawKey, answer)
    };
    if (migrateLegacy) {
      diaryCryptoKey = await importDiaryDataKey(rawKey);
      diaryKeyBytes = rawKey;
      diaryVault = { version: 2, password: passwordWrap, recovery };
    } else {
      diaryVault = { ...diaryVault, recovery };
    }
    await save('diary');
    const stored = JSON.parse(localStorage.getItem('board_' + currentUser + '_diaryVault') || 'null');
    if (!stored || stored.version !== 2 || !stored.recovery || stored.recovery.ciphertext !== recovery.ciphertext) {
      diaryVault = previousVault;
      diaryCryptoKey = previousKey;
      diaryKeyBytes = previousKeyBytes;
      render();
      toast('Recovery could not be saved on this device. Your existing diary setup is unchanged.');
      return;
    }
    render();
    toast('Diary recovery question saved.');
  } catch (err) {
    diaryVault = previousVault;
    diaryCryptoKey = previousKey;
    diaryKeyBytes = previousKeyBytes;
    console.error('Diary recovery setup failed:', err);
    toast('Could not save diary recovery. Check the current password and available storage.');
  }
}

function manageDiaryRecovery() {
  if (!diaryUnlocked || !diaryVault) return;
  const migrateLegacy = diaryVault.version === 1;
  const fields = [
    { k: 'question', label: 'Recovery question', type: 'text', req: true },
    { k: 'answer', label: 'Private recovery answer (at least 8 characters)', type: 'password', req: true }
  ];
  if (migrateLegacy) {
    fields.push({
      k: 'currentPassword',
      label: 'Current diary password (required to enable recovery)',
      type: 'password',
      req: true,
      trim: false
    });
  }
  const draft = { question: diaryVault.recovery ? diaryVault.recovery.question : '', answer: '', currentPassword: '' };
  editor(
    migrateLegacy ? 'Set up diary recovery' : 'Change diary recovery question',
    fields,
    draft,
    details => saveDiaryRecovery(details, migrateLegacy),
    extra => extra.append(el('p', 'diary-lock-copy', 'Your answer protects an encrypted recovery key. Choose a private answer only you know and keep it safe.'))
  );
}

async function lockDiary() {
  await flushDiarySave();
  clearDiaryMemory();
  render();
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden && diaryUnlocked) flushDiarySave();
});

function renderDiary() {
  const area = $('#diaryArea');
  area.innerHTML = '';
  if (!diaryUnlocked) {
    const firstUse = !diaryVault;
    const hasRecovery = diaryVault && diaryVault.version === 2 && diaryVault.recovery && diaryVault.recovery.question;
    const panel = el('div', 'diary-lock-card');
    panel.append(el('div', 'lock-icon', firstUse ? '🔐' : '🔒'));
    panel.append(el('h2', '', firstUse ? 'Create your private diary' : 'Your diary is locked'));
    panel.append(el('p', 'diary-lock-copy', firstUse
      ? 'Choose a password and a private recovery question and answer. Your answer can reset the password without losing your pages.'
      : 'Enter your diary password to decrypt and open your pages.'));
    const password = el('input', 'lock-input');
    password.type = 'password';
    password.autocomplete = firstUse ? 'new-password' : 'current-password';
    password.placeholder = firstUse ? 'At least 8 characters' : 'Diary password';
    password.setAttribute('aria-label', 'Diary password');
    const confirmation = el('input', 'lock-input');
    confirmation.type = 'password';
    confirmation.autocomplete = 'new-password';
    confirmation.placeholder = 'Confirm password';
    confirmation.setAttribute('aria-label', 'Confirm diary password');
    confirmation.hidden = !firstUse;
    const unlock = el('button', 'btn', firstUse ? '🔐 Create and open diary' : '🔓 Unlock diary');
    let recoveryQuestion = null;
    let recoveryAnswer = null;
    let recoveryFields = [];
    if (firstUse) {
      recoveryQuestion = el('input', 'lock-input');
      recoveryQuestion.type = 'text';
      recoveryQuestion.id = 'diaryRecoveryQuestion';
      recoveryQuestion.maxLength = 120;
      recoveryQuestion.placeholder = 'e.g. What was my childhood nickname?';
      recoveryQuestion.setAttribute('aria-label', 'Diary recovery question');
      const questionLabel = el('label', 'diary-lock-label', 'Recovery question');
      questionLabel.htmlFor = recoveryQuestion.id;
      questionLabel.append(recoveryQuestion);

      recoveryAnswer = el('input', 'lock-input');
      recoveryAnswer.type = 'password';
      recoveryAnswer.id = 'diaryRecoveryAnswer';
      recoveryAnswer.minLength = 8;
      recoveryAnswer.autocomplete = 'new-password';
      recoveryAnswer.placeholder = 'Private answer · at least 8 characters';
      recoveryAnswer.setAttribute('aria-label', 'Diary recovery answer');
      const answerLabel = el('label', 'diary-lock-label', 'Recovery answer');
      answerLabel.htmlFor = recoveryAnswer.id;
      answerLabel.append(recoveryAnswer);
      recoveryFields = [
        questionLabel,
        answerLabel,
        el('p', 'diary-lock-copy diary-recovery-warning', 'Keep the answer private and memorable. If you forget both the password and answer, encrypted pages cannot be recovered.')
      ];
    }
    unlock.onclick = () => unlockDiary(
      password.value,
      confirmation.value,
      recoveryQuestion ? recoveryQuestion.value : '',
      recoveryAnswer ? recoveryAnswer.value : ''
    );
    password.onkeydown = event => { if (event.key === 'Enter') unlock.click(); };
    confirmation.onkeydown = event => { if (event.key === 'Enter') unlock.click(); };
    panel.append(password, confirmation, ...recoveryFields, unlock);
    if (!firstUse && hasRecovery) {
      const forgot = el('button', 'sm diary-recovery-toggle', 'Forgot password?');
      forgot.type = 'button';
      forgot.setAttribute('aria-expanded', 'false');
      const recoveryForm = el('div', 'diary-recovery-form');
      recoveryForm.id = 'diaryRecoveryForm';
      recoveryForm.hidden = true;
      forgot.setAttribute('aria-controls', recoveryForm.id);
      recoveryForm.append(el('p', 'diary-recovery-question', 'Recovery question: ' + diaryVault.recovery.question));

      const answer = el('input', 'lock-input');
      answer.type = 'password';
      answer.autocomplete = 'off';
      answer.placeholder = 'Your recovery answer';
      answer.setAttribute('aria-label', 'Diary recovery answer');
      const answerLabel = el('label', 'diary-lock-label', 'Answer');
      answerLabel.append(answer);

      const newPassword = el('input', 'lock-input');
      newPassword.type = 'password';
      newPassword.autocomplete = 'new-password';
      newPassword.placeholder = 'New password · at least 8 characters';
      newPassword.setAttribute('aria-label', 'New diary password');
      const newPasswordLabel = el('label', 'diary-lock-label', 'New password');
      newPasswordLabel.append(newPassword);

      const newConfirmation = el('input', 'lock-input');
      newConfirmation.type = 'password';
      newConfirmation.autocomplete = 'new-password';
      newConfirmation.placeholder = 'Confirm new password';
      newConfirmation.setAttribute('aria-label', 'Confirm new diary password');
      const newConfirmationLabel = el('label', 'diary-lock-label', 'Confirm new password');
      newConfirmationLabel.append(newConfirmation);

      const reset = el('button', 'btn', 'Reset password and open diary');
      reset.type = 'button';
      reset.onclick = async () => {
        reset.disabled = true;
        await recoverDiary(answer.value, newPassword.value, newConfirmation.value);
        if (reset.isConnected) reset.disabled = false;
      };
      [answer, newPassword, newConfirmation].forEach(input => {
        input.onkeydown = event => { if (event.key === 'Enter') reset.click(); };
      });
      recoveryForm.append(answerLabel, newPasswordLabel, newConfirmationLabel, reset);
      forgot.onclick = () => {
        recoveryForm.hidden = !recoveryForm.hidden;
        forgot.textContent = recoveryForm.hidden ? 'Forgot password?' : 'Cancel password reset';
        forgot.setAttribute('aria-expanded', String(!recoveryForm.hidden));
      };
      panel.append(forgot, recoveryForm);
    } else if (!firstUse) {
      panel.append(el('p', 'diary-lock-copy diary-recovery-warning', diaryVault.version === 1
        ? 'This older diary has no recovery question yet. If you can unlock it, set one from the diary cover.'
        : 'No recovery question is configured. If you can unlock the diary, set one from its cover.'));
    }
    area.append(panel);
    return;
  }

  const stats = diaryStats();
  const tracker = el('section', 'diary-tracker');
  const trackerHead = el('div', 'diary-tracker-head');
  trackerHead.append(
    el('strong', '', '📅 Writing tracker'),
    el('span', 'tmeta', `${stats.dates.length} days written · 🔥 ${stats.streak} day streak`)
  );
  const strip = el('div', 'diary-cal-strip');
  for (let offset = 13; offset >= 0; offset--) {
    const date = addDays(today(), -offset);
    const written = stats.dates.includes(date);
    const button = el('button', 'cal-day' + (written ? ' written' : '') + (date === today() ? ' is-today' : ''));
    const day = new Date(date + 'T00:00');
    button.append(el('span', '', day.toLocaleDateString(undefined, { weekday: 'short' })));
    button.append(el('strong', '', String(day.getDate())));
    button.title = fmt(date) + (written ? ' (written)' : ' (write an entry)');
    button.onclick = () => createOrOpenDiaryPage(date);
    strip.append(button);
  }
  tracker.append(trackerHead, strip);
  area.append(tracker);

  if (!diaryBookOpen) {
    const stage = el('div', 'diary-book-stage');
    const cover = el('div', 'diary-cover');
    if (diaryMeta.cover) {
      cover.style.backgroundImage = `linear-gradient(rgba(0,0,0,.25), rgba(0,0,0,.55)), url("${diaryMeta.cover}")`;
    }
    const spiral = el('div', 'diary-spiral');
    spiral.setAttribute('aria-hidden', 'true');
    for (let index = 0; index < 18; index++) spiral.append(el('span', 'diary-coil'));
    const decorations = el('div', 'diary-cover-decor');
    decorations.setAttribute('aria-hidden', 'true');
    decorations.append(
      el('span', 'diary-sticker-star', '✦'),
      el('span', 'diary-sticker-heart', '♡'),
      el('span', 'diary-sticker-label', 'made of memories')
    );
    const content = el('div', 'diary-cover-content');
    content.append(
      el('div', 'diary-badge', 'PRIVATE JOURNAL'),
      el('h2', 'diary-cover-title', diaryMeta.title || 'My Personal Diary'),
      el('div', 'diary-cover-sub', `${data.diary.length} page${data.diary.length === 1 ? '' : 's'} · Encrypted`)
    );
    const open = el('button', 'btn diary-open-btn', '📖 Open diary');
    open.onclick = () => {
      if (!data.diary.length) createOrOpenDiaryPage();
      else {
        diaryBookOpen = true;
        diaryPageIdx = data.diary.length - 1;
        render();
      }
    };
    const coverButton = el('button', 'sm diary-cover-edit', '🎨 Change cover and title');
    coverButton.onclick = customizeDiaryCover;
    const recoveryButton = el('button', 'sm diary-recovery-manage', diaryVault.recovery ? '🔑 Recovery settings' : '🔑 Set recovery question');
    recoveryButton.onclick = manageDiaryRecovery;
    content.append(open, coverButton, recoveryButton);
    cover.append(spiral, decorations, content);
    stage.append(cover);
    area.append(stage);
    return;
  }

  const page = data.diary[diaryPageIdx];
  if (!page) {
    diaryBookOpen = false;
    render();
    return;
  }
  page.media = page.media || [];
  const stage = el('div', 'diary-book-stage');
  const toolbar = el('div', 'diary-toolbar');
  const closeBook = el('button', 'sm', '📕 Close book');
  closeBook.onclick = () => { diaryBookOpen = false; render(); };
  const themes = el('div', 'diary-themes');
  themes.append(el('span', 'tmeta', 'Page style:'));
  DIARY_THEMES.forEach(theme => {
    const button = el('button', 'sm' + ((page.theme || 'vintage') === theme.id ? ' active-theme' : ''), theme.label);
    button.onclick = () => { page.theme = theme.id; save('diary'); render(); };
    themes.append(button);
  });
  const addDate = el('button', 'sm', '+ Page for date');
  addDate.onclick = () => {
    const date = prompt('Enter a date (YYYY-MM-DD):', today());
    if (date && /^\d{4}-\d{2}-\d{2}$/.test(date) && !Number.isNaN(Date.parse(date))) createOrOpenDiaryPage(date);
    else if (date) toast('Enter a valid date in YYYY-MM-DD format.');
  };
  const recoveryButton = el('button', 'sm', diaryVault.recovery ? '🔑 Recovery settings' : '🔑 Set recovery question');
  recoveryButton.onclick = manageDiaryRecovery;
  toolbar.append(closeBook, themes, addDate, recoveryButton);

  const sheet = el('article', `diary-sheet theme-${page.theme || 'vintage'}`);
  sheet.append(el('div', 'diary-binding-shadow'));
  const header = el('div', 'diary-page-head');
  header.append(el('span', '', '📅 ' + fmt(page.date)));
  header.append(el('span', '', `Page ${diaryPageIdx + 1} of ${data.diary.length}`));
  sheet.append(header);

  const title = el('input', 'diary-title-input');
  title.placeholder = 'Title of today’s memory...';
  title.value = page.title || '';
  title.oninput = () => { page.title = title.value; save('diary'); };
  sheet.append(title);

  const editorToolbar = el('div', 'diary-editor-toolbar');
  const formatButton = (label, command, value) => {
    const button = el('button', 'sm', label);
    button.type = 'button';
    button.title = label;
    button.onmousedown = event => event.preventDefault();
    button.onclick = () => {
      document.execCommand(command, false, value || null);
      writing.focus();
      page.html = cleanDiaryHtml(writing.innerHTML);
      save('diary');
    };
    editorToolbar.append(button);
  };
  formatButton('B', 'bold');
  formatButton('I', 'italic');
  formatButton('U', 'underline');
  formatButton('• List', 'insertUnorderedList');
  formatButton('1. List', 'insertOrderedList');
  formatButton('↶', 'undo');
  formatButton('↷', 'redo');

  const font = el('select', 'diary-select');
  font.setAttribute('aria-label', 'Font');
  DIARY_FONTS.forEach(name => {
    const option = el('option', '', name);
    option.value = name;
    font.append(option);
  });
  font.onchange = () => document.execCommand('fontName', false, font.value);
  const size = el('select', 'diary-select');
  size.setAttribute('aria-label', 'Text size');
  [['3', 'Small'], ['4', 'Normal'], ['5', 'Large'], ['6', 'Extra large']].forEach(([value, label]) => {
    const option = el('option', '', label);
    option.value = value;
    size.append(option);
  });
  size.onchange = () => document.execCommand('fontSize', false, size.value);
  const color = el('input');
  color.type = 'color';
  color.title = 'Text color';
  color.setAttribute('aria-label', 'Text color');
  color.oninput = () => document.execCommand('foreColor', false, color.value);
  editorToolbar.append(font, size, color);
  sheet.append(editorToolbar);

  const writing = el('div', 'diary-writing-area');
  writing.contentEditable = 'true';
  writing.setAttribute('role', 'textbox');
  writing.setAttribute('aria-label', 'Diary entry');
  writing.setAttribute('aria-multiline', 'true');
  writing.innerHTML = cleanDiaryHtml(page.html);
  writing.dataset.placeholder = 'Dear diary, write your thoughts, feelings, and moments from today...';
  writing.oninput = () => { page.html = cleanDiaryHtml(writing.innerHTML); save('diary'); };
  writing.onpaste = event => {
    event.preventDefault();
    const text = (event.clipboardData || window.clipboardData).getData('text/plain');
    document.execCommand('insertText', false, text);
  };
  sheet.append(writing);

  if (page.media.length) {
    const mediaGrid = el('div', 'diary-media-grid');
    page.media.forEach((media, index) => {
      const card = el('div', 'diary-media-item');
      const remove = el('button', 'diary-media-del', '×');
      remove.type = 'button';
      remove.title = 'Remove attachment';
      remove.onclick = () => {
        page.media.splice(index, 1);
        removeDiaryFile(media.storagePath);
        save('diary');
        render();
      };
      if (media.type === 'video') {
        const video = el('video');
        video.src = media.src;
        video.controls = true;
        video.preload = 'metadata';
        video.playsInline = true;
        card.append(video);
      } else if (media.type === 'link') {
        const anchor = el('a', 'diary-link-chip', '🔗 ' + (media.label || media.url));
        anchor.href = media.url;
        anchor.target = '_blank';
        anchor.rel = 'noopener noreferrer';
        card.append(anchor);
      } else {
        const image = el('img');
        image.src = media.src;
        image.alt = media.label || 'Diary attachment';
        image.onclick = () => openLB({ src: media.src, title: media.label || fmt(page.date) });
        card.append(image);
      }
      card.append(remove);
      mediaGrid.append(card);
    });
    sheet.append(mediaGrid);
  }

  const footer = el('div', 'diary-page-foot');
  const addImage = el('button', 'sm', '📷 Add photo');
  const imageInput = el('input');
  imageInput.type = 'file';
  imageInput.accept = 'image/*';
  imageInput.multiple = true;
  imageInput.hidden = true;
  addImage.onclick = () => imageInput.click();
  imageInput.onchange = async () => {
    const files = Array.from(imageInput.files);
    imageInput.value = '';
    await uploadDiaryFiles(files, 'image', addImage, page);
  };

  const addVideo = el('button', 'sm', '🎥 Add video');
  const videoInput = el('input');
  videoInput.type = 'file';
  videoInput.accept = 'video/*';
  videoInput.multiple = true;
  videoInput.hidden = true;
  addVideo.onclick = () => videoInput.click();
  videoInput.onchange = async () => {
    const files = Array.from(videoInput.files);
    videoInput.value = '';
    await uploadDiaryFiles(files, 'video', addVideo, page);
  };

  const addLink = el('button', 'sm', '🔗 Add website / video link');
  addLink.onclick = () => {
    const raw = prompt('Paste a website or video link:');
    if (!raw) return;
    let url;
    try {
      url = new URL(raw);
      if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Unsupported link protocol.');
    } catch (err) {
      toast('Enter a valid http or https link.');
      return;
    }
    const label = prompt('Link name (optional):') || url.hostname;
    page.media.push({ type: 'link', url: url.href, label });
    save('diary');
    render();
  };

  const drawButton = el('button', 'sm', '✍ Draw');
  const deletePage = el('button', 'sm diary-delete-page', '🗑 Delete page');
  deletePage.onclick = () => {
    if (!confirm('Delete this diary page?')) return;
    page.media.forEach(media => removeDiaryFile(media.storagePath));
    data.diary.splice(diaryPageIdx, 1);
    diaryPageIdx = Math.max(0, diaryPageIdx - 1);
    save('diary');
    render();
  };
  footer.append(addImage, imageInput, addVideo, videoInput, addLink, drawButton, deletePage);
  sheet.append(footer);

  const drawingPanel = el('section', 'diary-drawing-panel');
  drawingPanel.hidden = true;
  drawingPanel.append(el('strong', '', 'Draw on this page'));
  const canvas = el('canvas', 'diary-canvas');
  canvas.width = 900;
  canvas.height = 240;
  const context = canvas.getContext('2d');
  context.lineWidth = 3;
  context.lineCap = 'round';
  let drawing = false;
  canvas.onpointerdown = event => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const rect = canvas.getBoundingClientRect();
    context.beginPath();
    context.moveTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
  };
  canvas.onpointermove = event => {
    if (!drawing) return;
    const rect = canvas.getBoundingClientRect();
    context.lineTo((event.clientX - rect.left) * canvas.width / rect.width, (event.clientY - rect.top) * canvas.height / rect.height);
    context.stroke();
  };
  canvas.onpointerup = () => { drawing = false; };
  canvas.onpointercancel = () => { drawing = false; };
  const penColor = el('input');
  penColor.type = 'color';
  penColor.value = '#242424';
  penColor.setAttribute('aria-label', 'Pen color');
  penColor.oninput = () => { context.strokeStyle = penColor.value; };
  context.strokeStyle = penColor.value;
  const clearDrawing = el('button', 'sm', 'Clear');
  clearDrawing.onclick = () => context.clearRect(0, 0, canvas.width, canvas.height);
  const saveDrawing = el('button', 'sm', 'Save drawing');
  saveDrawing.onclick = () => {
    canvas.toBlob(async blob => {
      if (!blob) return toast('Could not save this drawing.');
      saveDrawing.disabled = true;
      try {
        const path = `users/${currentUser}/diary/${page.id}/${Date.now()}-drawing.png`;
        const drawingRef = ref(storage, path);
        await uploadBytes(drawingRef, blob, { contentType: 'image/png' });
        page.media.push({ type: 'image', src: await getDownloadURL(drawingRef), storagePath: path, label: 'Drawing' });
        await save('diary');
        render();
      } catch (err) {
        console.error('Diary drawing upload failed:', err);
        toast(diaryUploadErrorMessage(err));
        saveDrawing.disabled = false;
      }
    }, 'image/png');
  };
  const closeDrawing = el('button', 'sm', 'Close');
  closeDrawing.onclick = () => { drawingPanel.hidden = true; };
  drawButton.onclick = () => { drawingPanel.hidden = !drawingPanel.hidden; };
  drawingPanel.append(canvas, penColor, clearDrawing, saveDrawing, closeDrawing);
  sheet.append(drawingPanel);

  const navigation = el('div', 'diary-page-nav');
  const previous = el('button', 'btn dark', diaryPageIdx === 0 ? '📕 Back to cover' : '← Previous page');
  previous.onclick = () => turnDiaryPage(-1);
  const next = el('button', 'btn', diaryPageIdx < data.diary.length - 1 ? 'Next page →' : '+ Write next page');
  next.onclick = () => {
    if (diaryPageIdx < data.diary.length - 1) turnDiaryPage(1);
    else createOrOpenDiaryPage(addDays(page.date, 1));
  };
  navigation.append(previous, next);
  stage.append(toolbar, sheet, navigation);
  area.append(stage);
}

function dashboardPreview(board) {
  const items = data[board.k] || [];
  if (board.k === 'diary') {
    return [{
      label: diaryVault ? 'Private pages stay encrypted' : 'Start a private journal',
      detail: diaryVault ? 'Unlock your diary to view its pages' : 'Only you can open this folder'
    }];
  }
  if (board.kind === 'photos') {
    return items.slice(0, 3).map((item, index) => ({
      label: item.title || (item.type === 'video' ? 'Video ' : 'Photo ') + (index + 1),
      detail: item.summary || (item.date ? fmt(item.date) : '')
    }));
  }
  if (board.kind === 'books') {
    return items.slice(0, 3).map(item => ({
      label: item.title || 'Untitled book',
      detail: item.author || item.summary || ''
    }));
  }
  if (board.kind === 'tasks') {
    return items.slice(0, 3).map(item => {
      const status = taskStatus(item);
      return {
        label: item.title || 'Untitled task',
        detail: status ? status[0] : (item.date ? fmt(item.date) : 'To-do')
      };
    });
  }
  if (board.kind === 'report') {
    return items.slice(0, 3).map(item => {
      const logged = Object.values(item.entries || {}).filter(entry => entry && entry.text).length;
      return {
        label: item.title || 'Untitled tracker',
        detail: logged + (logged === 1 ? ' report logged' : ' reports logged')
      };
    });
  }
  if (board.kind === 'webs') {
    return items.slice(0, 3).map(item => ({
      label: item.title || item.url || 'Untitled website',
      detail: item.summary || item.url || 'Linked website'
    }));
  }
  return [];
}

function renderDashboard() {
  const dashboard = $('#dashboard');
  if (!dashboard) return;
  dashboard.innerHTML = '';

  const heading = el('header', 'dashboard-heading');
  const intro = el('div');
  intro.append(el('h1', '', 'My Boards'));
  intro.append(el('p', '', 'Your life, curated. Every memory, milestone, and daily dream in one place.'));
  heading.append(intro);
  dashboard.append(heading);

  const welcome = el('section', 'dashboard-welcome');
  const welcomeCopy = el('div', 'dashboard-welcome-copy');
  welcomeCopy.append(el('div', 'dashboard-eyebrow', '📖 Welcome to Your Curated Spaces'));
  welcomeCopy.append(el('p', '', 'Choose a scrapbook folder for your journey. Celebrate achievements, cultivate your goals, and keep private thoughts safely locked.'));
  welcome.append(welcomeCopy);
  [
    ['🏆', 'Celebrate', 'Save the wins and moments you are proud of.'],
    ['🌱', 'Cultivate', 'Track books, daily habits, goals, and tasks.'],
    ['🔒', 'Cherish', 'Keep your personal diary private and encrypted.']
  ].forEach(([icon, title, description]) => {
    const note = el('div', 'welcome-note');
    note.append(el('span', 'welcome-note-icon', icon));
    const text = el('div');
    text.append(el('strong', '', title));
    text.append(el('span', '', description));
    note.append(text);
    welcome.append(note);
  });
  dashboard.append(welcome);

  const folders = el('section', 'folder-grid');
  folders.setAttribute('aria-label', 'Your scrapbook folders');
  const icons = {
    ach: '🏆', want: '✨', five: '⌛', books: '📚',
    tasks: '📝', report: '🔥', webs: '🌐', diary: '🔒'
  };
  BOARDS.forEach(board => {
    const items = data[board.k] || [];
    const isLockedDiary = board.k === 'diary' && !diaryUnlocked;
    const card = el('button', 'folder-card');
    card.type = 'button';
    card.dataset.board = board.k;
    card.setAttribute('aria-label', 'Open ' + board.name + (isLockedDiary ? ', locked' : ', ' + items.length + ' items'));

    const folderTab = el('span', 'folder-tab');
    folderTab.append(el('span', 'folder-icon', icons[board.k] || '📁'));
    folderTab.append(el('span', 'folder-name', board.name.replace('📖 ', '')));
    folderTab.append(el('span', 'folder-count', isLockedDiary ? '🔒' : String(items.length)));

    const body = el('span', 'folder-body');
    body.append(el('span', 'folder-description', board.tag));
    const preview = el('span', 'folder-preview');
    const rows = dashboardPreview(board);
    if (!rows.length) {
      const emptyText = board.kind === 'photos'
        ? 'No photos or videos yet'
        : board.kind === 'books'
          ? 'No books added yet'
          : board.kind === 'tasks'
            ? 'No tasks added yet'
            : board.kind === 'report'
              ? 'No trackers added yet'
              : board.kind === 'webs'
                ? 'No websites linked yet'
                : 'No items yet';
      preview.append(el('span', 'folder-empty', emptyText));
    } else {
      rows.forEach(row => {
        const line = el('span', 'folder-preview-row');
        line.append(el('span', 'folder-preview-title', row.label));
        if (row.detail) line.append(el('span', 'folder-preview-detail', row.detail));
        preview.append(line);
      });
    }
    body.append(preview);
    body.append(el('span', 'folder-open', 'Open folder →'));
    card.append(folderTab, body);
    card.onclick = () => openBoard(board.k);
    folders.append(card);
  });
  dashboard.append(folders);
}

function openBoard(key) {
  if (cur === 'diary' && key !== 'diary') lockDiary();
  cur = key;
  if (location.hash !== '#' + key) location.hash = key;
  render();
}

function goHome() {
  if (cur === 'diary') lockDiary();
  cur = 'home';
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
  render();
}

function render() {
  const isDashboard = cur === 'home';
  const dashboard = $('#dashboard');
  if (dashboard) dashboard.hidden = !isDashboard;
  ['.top', '#drop', '#boardFrame', '#list', '#diaryArea'].forEach(selector => {
    const section = $(selector);
    if (section) section.hidden = isDashboard;
  });
  if (isDashboard) {
    renderDashboard();
    return;
  }

  const b = BOARDS.find(x => x.k === cur);
  if (!b) return;
  const items = data[cur] || [];
  
  const titleEl = $('#title');
  if (titleEl) titleEl.textContent = b.name;
  
  const tagEl = $('#tag');
  if (tagEl) tagEl.textContent = b.tag;
  
  const countEl = $('#count');
  if (countEl) countEl.textContent = items.length;

  const photos = b.kind === 'photos';
  const boardFrame = $('#boardFrame');
  if (boardFrame) boardFrame.classList.toggle('photo-board', photos);
  const shuffle = $('#shuffle'); if (shuffle) {
    shuffle.hidden = !photos;
    shuffle.disabled = items.length < 2;
  }
  const drop = $('#drop'); if (drop) drop.hidden = !photos;
  const play = $('#play'); if (play) play.hidden = !photos;
  const add = $('#add'); if (add) add.hidden = !photos;
  const addLink = $('#addLink'); if (addLink) addLink.hidden = !photos;
  const addBook = $('#addBook'); if (addBook) addBook.hidden = b.kind !== 'books';
  const addTask = $('#addTask'); if (addTask) addTask.hidden = b.kind !== 'tasks';
  const addGoal = $('#addGoal'); if (addGoal) addGoal.hidden = b.kind !== 'report';
  const addWeb = $('#addWeb'); if (addWeb) addWeb.hidden = b.kind !== 'webs';
  const isDiary = b.kind === 'diary';
  const newDiaryPage = $('#newDiaryPage'); if (newDiaryPage) newDiaryPage.hidden = !isDiary || !diaryUnlocked;
  const diaryCoverBtn = $('#diaryCoverBtn'); if (diaryCoverBtn) diaryCoverBtn.hidden = !isDiary || !diaryUnlocked;
  const lockDiaryBtn = $('#lockDiaryBtn'); if (lockDiaryBtn) lockDiaryBtn.hidden = !isDiary || !diaryUnlocked;

  const listView = b.kind === 'tasks' || b.kind === 'report' || b.kind === 'webs';
  const grid = $('#grid'); if (grid) {
    grid.hidden = listView || isDiary;
    grid.classList.toggle('books-grid', b.kind === 'books');
  }
  const list = $('#list'); if (list) list.hidden = !listView;
  const diaryArea = $('#diaryArea'); if (diaryArea) diaryArea.hidden = !isDiary;

  if (b.kind === 'tasks')  { renderTasks();  return; }
  if (b.kind === 'report') { renderReport(); return; }
  if (b.kind === 'webs')   { renderWebsites(); return; }
  if (isDiary) { renderDiary(); return; }

  const g = $('#grid');
  if (!g) return;
  g.innerHTML = '';
  if (!items.length) {
    g.style.columns = '1';
    g.append(el('div', 'empty', photos ? 'This board is empty. Add photos or videos.' : 'No books yet.'));
    return;
  }
  g.style.columns = '';
  const displayItems = photos ? orderedPhotoItems(cur, items) : items;
  displayItems.forEach(it => g.append(b.kind === 'books' ? bookCard(it) : pinCard(it)));
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
const backToDashboardBtn = $('#backToDashboard');
if (backToDashboardBtn) backToDashboardBtn.onclick = goHome;

const newDiaryPageBtn = $('#newDiaryPage');
if (newDiaryPageBtn) newDiaryPageBtn.onclick = () => createOrOpenDiaryPage();
const diaryCoverBtn = $('#diaryCoverBtn');
if (diaryCoverBtn) diaryCoverBtn.onclick = customizeDiaryCover;
const lockDiaryBtn = $('#lockDiaryBtn');
if (lockDiaryBtn) lockDiaryBtn.onclick = lockDiary;

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
  cur = KEYS.includes(h) ? h : 'home';
}
window.addEventListener('hashchange', () => {
  const previous = cur;
  fromHash();
  if (previous === 'diary' && cur !== 'diary') lockDiary();
  render();
});

// =====================================================
//  BACKUP + RESTORE
// =====================================================
const blobToURL = b => new Promise(r => { const f = new FileReader(); f.onload = () => r(f.result); f.readAsDataURL(b); });
async function exportData() {
  await diarySaveQueue;
  const out = {};
  for (const k of KEYS) {
    out[k] = [];
    if (k === 'diary') continue;
    for (const it of data[k]) {
      const c = { ...it };
      if (c.blob) { c.blobURL = await blobToURL(c.blob); delete c.blob; }
      out[k].push(c);
    }
  }
  out.diaryVault = diaryVault;
  return out;
}
async function importData(saved) {
  const out = {};
  for (const k of KEYS) {
    out[k] = [];
    if (k === 'diary') continue;
    for (const it of (saved[k] || [])) {
      const c = { ...it };
      if (c.blobURL) { c.blob = await (await fetch(c.blobURL)).blob(); delete c.blobURL; }
      out[k].push(c);
    }
  }
  data = out;
  diaryVault = saved.diaryVault || null;
  clearDiaryMemory();
}

function closeAccountSettings() {
  const settings = $('#accountSettings');
  if (settings) settings.open = false;
}

const backupBtn = $('#backup');
if (backupBtn) {
  backupBtn.onclick = async () => {
    closeAccountSettings();
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
if (restoreBtn) restoreBtn.onclick = () => {
  closeAccountSettings();
  const rf = $('#restoreFile');
  if (rf) rf.click();
};

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

const shuffleBtn = $('#shuffle');
if (shuffleBtn) shuffleBtn.onclick = () => shufflePhotoBoard(cur);

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

async function deleteStorageTree(directory) {
  const contents = await listAll(directory);
  for (const item of contents.items) await deleteObject(item);
  for (const folder of contents.prefixes) await deleteStorageTree(folder);
}

async function reauthenticateForDeletion(user) {
  const providers = user.providerData || [];
  if (providers.some(provider => provider.providerId === 'password')) {
    const password = $('#deleteAccountPassword').value;
    if (!password) throw new Error('Enter your current account password to continue.');
    if (!user.email) throw new Error('Your account has no email address to verify.');
    await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, password));
    return;
  }
  if (providers.some(provider => provider.providerId === 'google.com')) {
    await reauthenticateWithPopup(user, new GoogleAuthProvider());
    return;
  }
  throw new Error('This sign-in method cannot be verified here. Sign in again and retry account deletion.');
}

function waitForCurrentUser() {
  if (auth.currentUser) return Promise.resolve(auth.currentUser);
  return new Promise((resolve, reject) => {
    let unsubscribe = () => {};
    unsubscribe = onAuthStateChanged(auth, user => {
      unsubscribe();
      resolve(user);
    }, error => {
      unsubscribe();
      reject(error);
    });
  });
}

function clearLocalAccountData(uid) {
  const prefix = 'board_' + uid + '_';
  for (let index = localStorage.length - 1; index >= 0; index--) {
    const key = localStorage.key(index);
    if (key === 'currentUser' || (key && key.startsWith(prefix))) localStorage.removeItem(key);
  }
}

function accountDeletionError(error, cleanupStarted) {
  if (cleanupStarted) {
    return 'Deletion stopped after cloud cleanup began. Some data may already be erased; sign in again and retry. ' +
      (error.code || error.message || 'Unknown error');
  }
  if (error.code === 'auth/wrong-password' || error.code === 'auth/invalid-credential') {
    return 'The password was not accepted. No account data was deleted.';
  }
  if (error.code === 'auth/popup-closed-by-user') {
    return 'Verification was cancelled. No account data was deleted.';
  }
  return (error.message || 'Account deletion could not be started.') + ' No account data was deleted.';
}

const deleteAccountButton = $('#deleteAccount');
const deleteAccountDialog = $('#deleteAccountDialog');
const deleteAccountForm = $('#deleteAccountForm');
const deleteAccountConfirmation = $('#deleteAccountConfirmation');
const confirmDeleteAccountButton = $('#confirmDeleteAccount');
const cancelDeleteAccountButton = $('#cancelDeleteAccount');
const deleteAccountPassword = $('#deleteAccountPassword');
const deleteAccountPasswordLabel = $('#deleteAccountPasswordLabel');
const deleteAccountStatus = $('#deleteAccountStatus');

if (deleteAccountButton && deleteAccountDialog && deleteAccountForm) {
  deleteAccountButton.onclick = () => {
    closeAccountSettings();
    deleteAccountConfirmation.value = '';
    deleteAccountPassword.value = '';
    deleteAccountStatus.textContent = '';
    confirmDeleteAccountButton.disabled = true;
    const user = auth.currentUser;
    const passwordSignIn = !!user && (user.providerData || []).some(provider => provider.providerId === 'password');
    deleteAccountPassword.required = passwordSignIn;
    deleteAccountDialog.showModal();
    deleteAccountConfirmation.focus();
  };

  deleteAccountConfirmation.oninput = () => {
    confirmDeleteAccountButton.disabled = deleteAccountConfirmation.value.trim() !== 'DELETE';
  };
  cancelDeleteAccountButton.onclick = () => deleteAccountDialog.close();
  deleteAccountForm.onsubmit = async event => {
    event.preventDefault();
    if (deleteAccountConfirmation.value.trim() !== 'DELETE') {
      deleteAccountStatus.textContent = 'Type DELETE exactly to confirm.';
      return;
    }

    let cleanupStarted = false;
    confirmDeleteAccountButton.disabled = true;
    cancelDeleteAccountButton.disabled = true;
    deleteAccountConfirmation.disabled = true;
    deleteAccountPassword.disabled = true;
    deleteAccountStatus.textContent = 'Verifying your sign-in…';
    try {
      const user = await waitForCurrentUser();
      if (!user || user.uid !== currentUser) {
        throw new Error('Your sign-in is unavailable or has changed.');
      }
      await reauthenticateForDeletion(user);
      deleteAccountStatus.textContent = 'Removing your saved boards and uploaded files…';
      await flushDiarySave();
      cleanupStarted = true;
      await deleteStorageTree(ref(storage, 'users/' + user.uid));
      await deleteDoc(doc(db, 'users', user.uid));
      await deleteUser(user);
      clearLocalAccountData(user.uid);
      window.location.replace('login.html');
    } catch (error) {
      console.error('Account deletion failed:', error);
      deleteAccountStatus.textContent = accountDeletionError(error, cleanupStarted);
      confirmDeleteAccountButton.disabled = deleteAccountConfirmation.value.trim() !== 'DELETE';
      cancelDeleteAccountButton.disabled = false;
      deleteAccountConfirmation.disabled = false;
      deleteAccountPassword.disabled = false;
    }
  };
}

// ----- log out -----
const logoutBtn = $('#logout');
if (logoutBtn) {
  logoutBtn.onclick = async () => {
    closeAccountSettings();
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

  const card = el('div', 'goal report-card');
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
  const list = el('div', 'days');
  const reportToggle = el('button', 'sm report-toggle', expandedReportTrackers.has(g) ? 'Hide reports' : 'Show reports');
  reportToggle.type = 'button';
  reportToggle.setAttribute('aria-expanded', String(expandedReportTrackers.has(g)));
  reportToggle.onclick = () => {
    const expanded = expandedReportTrackers.has(g);
    if (expanded) expandedReportTrackers.delete(g);
    else expandedReportTrackers.add(g);
    list.hidden = expanded;
    reportToggle.textContent = expanded ? 'Show reports' : 'Hide reports';
    reportToggle.setAttribute('aria-expanded', String(!expanded));
  };
  if (t0 >= g.start) act.append(reportToggle);
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

  const reportsExpanded = expandedReportTrackers.has(g);
  list.hidden = !reportsExpanded;
  const last = t0 < end ? t0 : end;
  for (let day = last; day >= g.start; day = addDays(day, -1)) {
    const e = entries[day];
    const hasEntry = !!(e && e.text);
    const row = el('div', 'day' + (hasEntry ? ' has-entry' : ''));
    row.append(el('div', 'dd', fmt(day)));
    const reportPreview = el('div', 'dt' + (hasEntry ? '' : ' none'), hasEntry ? e.text : 'No entry');
    if (hasEntry) reportPreview.title = e.text;
    row.append(reportPreview);

    const actions = el('div', 'day-actions');
    if (hasEntry) {
      const edit = el('button', 'sm', 'Edit');
      edit.type = 'button';
      edit.onclick = () => logDay(g, day);
      actions.append(edit);
    } else {
      const write = el('button', 'sm', 'Write');
      write.type = 'button';
      write.onclick = () => logDay(g, day);
      actions.append(write);
    }
    row.append(actions);
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