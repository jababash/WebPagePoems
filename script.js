'use strict';

const STORAGE_KEY_PREFIX = 'potd_';
const API_BATCH_URL      = 'https://poetrydb.org/random/5';

/* ============================================================
   DATE HELPERS
   ============================================================ */

function getTodayKey() {
  const now  = new Date();
  const yyyy = now.getFullYear();
  const mm   = String(now.getMonth() + 1).padStart(2, '0');
  const dd   = String(now.getDate()).padStart(2, '0');
  return `${STORAGE_KEY_PREFIX}${yyyy}-${mm}-${dd}`;
}

function formatDisplayDate(dateStr) {
  // dateStr: "2026-04-25"
  const [yyyy, mm, dd] = dateStr.split('-').map(Number);
  const d = new Date(yyyy, mm - 1, dd); // local date, no UTC shift
  return d.toLocaleDateString('en-US', {
    weekday: 'long',
    year:    'numeric',
    month:   'long',
    day:     'numeric',
  });
}

/* ============================================================
   UI STATE HELPERS
   ============================================================ */

function showElement(id) {
  document.getElementById(id).classList.remove('hidden');
}

function hideElement(id) {
  document.getElementById(id).classList.add('hidden');
}

function showLoading(on) {
  if (on) {
    showElement('js-loading');
    hideElement('js-error');
    hideElement('js-poem-card');
  } else {
    hideElement('js-loading');
  }
}

function showError(on) {
  if (on) {
    hideElement('js-loading');
    showElement('js-error');
    hideElement('js-poem-card');
  } else {
    hideElement('js-error');
  }
}

let toastTimer = null;

function showToast(message) {
  const el = document.getElementById('js-toast');
  el.textContent = message;
  el.classList.remove('hidden');
  el.classList.add('visible');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.classList.remove('visible');
  }, 2500);
}

/* ============================================================
   RENDER
   ============================================================ */

function renderDate(dateStr) {
  document.getElementById('js-date').textContent = formatDisplayDate(dateStr);
}

function renderPoem(poem) {
  document.getElementById('js-title').textContent  = poem.title;
  document.getElementById('js-author').textContent = poem.author;
  document.getElementById('js-body').textContent   = poem.lines.join('\n');

  hideElement('js-loading');
  hideElement('js-error');
  showElement('js-poem-card');
  startCountdown();
}

/* ============================================================
   COUNTDOWN
   ============================================================ */

function startCountdown() {
  const el = document.getElementById('js-countdown');

  function tick() {
    const now      = new Date();
    const midnight = new Date(now);
    midnight.setHours(24, 0, 0, 0); // next local midnight
    const diffMs   = midnight - now;

    const h = Math.floor(diffMs / 3_600_000);
    const m = Math.floor((diffMs % 3_600_000) / 60_000);
    const s = Math.floor((diffMs % 60_000) / 1_000);

    el.textContent = [h, m, s]
      .map(n => String(n).padStart(2, '0'))
      .join(':');

    if (diffMs <= 1000) {
      window.location.reload();
    }
  }

  tick();
  setInterval(tick, 1000);
}

/* ============================================================
   SHARE
   ============================================================ */

function sharePoem() {
  const title  = document.getElementById('js-title').textContent;
  const author = document.getElementById('js-author').textContent;
  const body   = document.getElementById('js-body').textContent;

  const shareText = `${title}\nby ${author}\n\n${body}`;
  const shareData = {
    title: `Poem of the Day: ${title}`,
    text:  shareText,
    url:   window.location.href,
  };

  if (navigator.share && navigator.canShare && navigator.canShare(shareData)) {
    navigator.share(shareData).catch(() => {});
  } else {
    navigator.clipboard.writeText(shareText)
      .then(() => showToast('Copied to clipboard'))
      .catch(() => showToast('Could not copy — try selecting the text manually'));
  }
}

/* ============================================================
   FETCH & CACHE
   ============================================================ */

async function fetchAndCache(key) {
  showLoading(true);
  try {
    const response = await fetch(API_BATCH_URL);
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const poems = await response.json();
    if (!Array.isArray(poems) || poems.length === 0) throw new Error('Empty response');

    const poem = poems[0];

    try {
      localStorage.setItem(key, JSON.stringify(poem));
    } catch {
      // localStorage unavailable (e.g. private browsing) — continue without caching
    }

    renderPoem(poem);
  } catch (err) {
    console.error('fetchAndCache error:', err);
    showLoading(false);
    showError(true);
  }
}

/* ============================================================
   LOAD POEM (ENTRY POINT)
   ============================================================ */

async function loadPoem() {
  const key     = getTodayKey();
  const dateStr = key.replace(STORAGE_KEY_PREFIX, '');

  renderDate(dateStr);

  let cachedPoem = null;
  try {
    const raw = localStorage.getItem(key);
    if (raw) cachedPoem = JSON.parse(raw);
  } catch {
    // Corrupt cache or localStorage unavailable — fall through to fetch
    try { localStorage.removeItem(key); } catch {}
  }

  if (cachedPoem) {
    renderPoem(cachedPoem);
    return;
  }

  await fetchAndCache(key);
}

/* ============================================================
   HOUSEKEEPING — prune old cache keys
   ============================================================ */

function pruneOldCache() {
  const todayKey = getTodayKey();
  try {
    Object.keys(localStorage)
      .filter(k => k.startsWith(STORAGE_KEY_PREFIX) && k !== todayKey)
      .forEach(k => localStorage.removeItem(k));
  } catch {
    // localStorage unavailable — skip
  }
}

/* ============================================================
   INIT
   ============================================================ */

document.addEventListener('DOMContentLoaded', () => {
  pruneOldCache();

  document.getElementById('js-share').addEventListener('click', sharePoem);

  document.getElementById('js-retry').addEventListener('click', () => {
    showError(false);
    fetchAndCache(getTodayKey());
  });

  loadPoem();
});
