/**
 * translate.mjs — dependency-free FR translation for news items.
 *
 * Engines: Google's unofficial gtx endpoint (primary), MyMemory (fallback).
 * Nothing is ever thrown for a single item: failures degrade to the original
 * string with `translated: false` so attribution still has the source text.
 *
 * Public API:
 *   translateText(text, { from, to }) -> string
 *   translateBatch(entries, { to, concurrency, cache, budget }) -> items[]
 *   createCache(filePath) -> { get, set, save, stats }
 *
 * No console output. No npm packages. Node >= 20 (uses global fetch,
 * AbortSignal.timeout); developed and measured on Node 25.2.1 / Windows.
 */

import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { mkdir, rename, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';

/* ------------------------------------------------------------------ config */

const GOOGLE_ENDPOINT = 'https://translate.googleapis.com/translate_a/single';
const MYMEMORY_ENDPOINT = 'https://api.mymemory.translated.net/get';

const DEFAULT_TO = 'fr';
const DEFAULT_BUDGET = 300;        // outbound attempts per translateBatch run
const DEFAULT_CONCURRENCY = 4;
const REQUEST_TIMEOUT_MS = 12_000; // per attempt, AbortSignal.timeout
const RETRY_BACKOFF_MS = 450;      // one retry, jittered upward
const MAX_ATTEMPTS = 2;            // primary attempt + one retry on 429/5xx
const MIN_MATCH = 0.5;             // MyMemory confidence floor
const CACHE_VERSION = 1;
const ENGINE_PRIORITY = ['google', 'mymemory', 'cache', 'passthrough', 'budget', 'none'];

/* ------------------------------------------------------------------ helpers */

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** A text is worth a request only if it is a non-blank string. */
function isTranslatable(text) {
  return typeof text === 'string' && text.trim().length > 0;
}

/** "fr-CA" and "FR" both mean French. */
function baseLang(lang) {
  return typeof lang === 'string' ? lang.trim().toLowerCase().split(/[-_]/)[0] : '';
}

/**
 * Stable cache key: sha1(from + '|' + text).
 *
 * The `to` language is folded in only when it is not French, so the documented
 * `<from>|<text>` key holds for the supported French target while a caller that
 * asks for another target can never read a French entry by accident.
 */
export function cacheKey(from, text, to = DEFAULT_TO) {
  const src = typeof from === 'string' && from.trim() ? from.trim().toLowerCase() : 'auto';
  const body = baseLang(to) === DEFAULT_TO ? `${src}|${text}` : `${src}|${baseLang(to)}|${text}`;
  return createHash('sha1').update(body, 'utf8').digest('hex');
}

function budgetSignal() {
  const e = new Error('request budget exhausted');
  e.code = 'BUDGET';
  return e;
}

/** Carries an HTTP status so the retry policy can classify without string matching. */
function httpError(status, detail) {
  const e = new Error(`HTTP ${status}${detail ? `: ${detail}` : ''}`);
  e.status = status;
  return e;
}

const isRetryable = (e) => e && (e.status === 429 || (typeof e.status === 'number' && e.status >= 500));

/* -------------------------------------------------------------- html entities */

/**
 * Engines HTML-decode `&amp;` → `&` and translate a bare `&` into "et". Callers
 * that already decoded are fine, but a caller that keeps `&`/entities must get
 * them back verbatim, so each is swapped for a private-use codepoint, which
 * both engines pass through intact.
 */
const ENTITY_RE = /&(?:[a-zA-Z][a-zA-Z0-9]{1,10}|#\d{1,6}|#x[0-9a-fA-F]{1,6});|&/g;
const PUA_BASE = 0xe000;
const MAX_ENTITY_TOKENS = 200;
const STRAY_ENTITY_RE = /&(amp|lt|gt|quot|apos|nbsp|laquo|raquo|#39|#34|#160);/g;
const STRAY_ENTITY_MAP = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: '\u00a0',
  laquo: '«', raquo: '»', '#39': "'", '#34': '"', '#160': '\u00a0',
};

function protectEntities(text) {
  const distinct = [...new Set(text.match(ENTITY_RE) ?? [])];
  if (distinct.length === 0 || distinct.length > MAX_ENTITY_TOKENS) return { text, tokens: [] };
  // Single pass: a sequential split/join would let the bare `&` token eat `&amp;`.
  const tokenFor = new Map(distinct.map((entity, i) => [entity, String.fromCodePoint(PUA_BASE + i)]));
  return {
    text: text.replace(ENTITY_RE, (m) => tokenFor.get(m)),
    tokens: [...tokenFor].map(([entity, token]) => [token, entity]),
  };
}

function restoreEntities(text, tokens) {
  let out = text;
  for (const [token, entity] of tokens) out = out.split(token).join(entity);
  return out;
}

/** If the source had no `&` at all but the engine escaped some, undo that. */
function decodeStrayEntities(source, translated) {
  if (source.includes('&')) return translated;
  return translated.replace(STRAY_ENTITY_RE, (m, name) => STRAY_ENTITY_MAP[name] ?? m);
}

/* ------------------------------------------------------------------ engines */

/**
 * Per-run context: counts every outbound attempt against a hard budget so a
 * scheduled build cannot hammer the endpoint, and pins the fetch seam.
 */
function createContext({ signal, fetchImpl, timeoutMs, budget }) {
  let remaining = Number.isFinite(budget) && budget >= 0 ? budget : DEFAULT_BUDGET;
  return {
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : REQUEST_TIMEOUT_MS,
    fetchImpl: typeof fetchImpl === 'function' ? fetchImpl : globalThis.fetch,
    signal,
    remaining: () => remaining,
    /** Reserve one attempt; throws a BUDGET error when the run is out of budget. */
    take() {
      if (remaining <= 0) throw budgetSignal();
      remaining -= 1;
    },
  };
}

function checkSignal(ctx) {
  if (ctx.signal?.aborted) {
    const e = new Error('translateBatch aborted');
    e.name = 'AbortError';
    throw e;
  }
}

/**
 * One HTTP attempt. Returns { status, text }. Network errors and timeouts
 * propagate; non-2xx become httpError so retry/fallback can classify them.
 */
async function request(ctx, url, { accept = 'application/json, text/plain, */*' } = {}) {
  checkSignal(ctx);
  ctx.take();
  const res = await ctx.fetchImpl(url, {
    signal: AbortSignal.timeout(ctx.timeoutMs),
    headers: { accept, 'accept-language': 'fr,en;q=0.8' },
    redirect: 'follow',
  });
  const text = await res.text();
  if (!res.ok) throw httpError(res.status, text.slice(0, 120).replace(/\s+/g, ' '));
  return { status: res.status, text };
}

/** Single retry on 429/5xx with short jittered backoff; everything else fails fast. */
async function withRetry(ctx, doRequest) {
  for (let attempt = 1; ; attempt++) {
    try {
      return await doRequest();
    } catch (e) {
      const canRetry = attempt < MAX_ATTEMPTS && isRetryable(e) && !ctx.signal?.aborted;
      if (!canRetry) throw e;
      await sleep(RETRY_BACKOFF_MS + Math.floor(Math.random() * 250));
    }
  }
}

/**
 * Google gtx payload is `[[ [trans, src, ...], ... ], null, detectedLang, ...]`.
 * Only `data[0][i][0]` is the translated text; concatenating the segments keeps
 * paragraph breaks because the endpoint emits one segment per source line.
 */
function parseGoogle(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('google: response was not JSON');
  }
  const segments = Array.isArray(data) ? data[0] : null;
  if (!Array.isArray(segments)) throw new Error('google: unexpected payload shape');
  let out = '';
  for (const seg of segments) {
    if (Array.isArray(seg) && typeof seg[0] === 'string') out += seg[0];
  }
  if (!out.trim()) throw new Error('google: empty translation');
  return out;
}

async function viaGoogle(ctx, text, from, to) {
  const url =
    `${GOOGLE_ENDPOINT}?client=gtx&sl=${encodeURIComponent(from)}` +
    `&tl=${encodeURIComponent(to)}&dt=t&q=${encodeURIComponent(text)}`;
  const { text: body } = await withRetry(ctx, () => request(ctx, url));
  return parseGoogle(body);
}

/** MyMemory reports errors as HTTP 200 with an uppercase English sentence. */
const MYMEMORY_ERROR_TEXT = /^(INVALID|NO QUERY|QUERY LENGTH|PLEASE SELECT|MYMEMORY WARNING|LANGUAGE PAIR)/i;

function parseMyMemory(text) {
  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('mymemory: response was not JSON');
  }
  const rd = data?.responseData;
  const translated = rd?.translatedText;
  const status = Number(data?.responseStatus ?? rd?.responseStatus ?? 200);
  if (!Number.isFinite(status) || status >= 400) throw new Error(`mymemory: status ${status}`);
  if (typeof translated !== 'string' || !translated.trim()) throw new Error('mymemory: empty translation');
  if (MYMEMORY_ERROR_TEXT.test(translated.trim())) throw new Error('mymemory: engine error message');
  // `match` is absent on error responses, so a missing score is a rejection too.
  const match = Number(rd?.match);
  if (!Number.isFinite(match) || match < MIN_MATCH) throw new Error(`mymemory: low match ${rd?.match}`);
  return translated;
}

async function viaMyMemory(ctx, text, from, to) {
  const url =
    `${MYMEMORY_ENDPOINT}?q=${encodeURIComponent(text)}` +
    `&langpair=${encodeURIComponent(`${from}|${to}`)}`;
  const { text: body } = await withRetry(ctx, () => request(ctx, url));
  return parseMyMemory(body);
}

/**
 * Translate one string through the engine chain.
 * Returns { text, engine } where engine is 'none' when the original survives.
 */
async function translateOne(ctx, text, from, to) {
  if (!isTranslatable(text)) return { text: typeof text === 'string' ? text : '', engine: 'none' };

  // Same language, or already the target: never spend a request.
  if (baseLang(from) === baseLang(to)) {
    return { text, engine: 'passthrough' };
  }

  let sawBudget = false;
  // Entities are swapped for placeholders so the engines cannot decode them.
  const shielded = protectEntities(text);
  const finish = (raw, engine) => ({
    text: decodeStrayEntities(text, restoreEntities(raw, shielded.tokens)),
    engine,
  });

  try {
    return finish(await viaGoogle(ctx, shielded.text, from, to), 'google');
  } catch (e) {
    if (e?.code === 'BUDGET') sawBudget = true;
    if (e?.name === 'AbortError' && ctx.signal?.aborted) throw e;
  }

  // MyMemory cannot resolve 'auto' or a blank source language, so skip it then.
  const fallbackFrom = baseLang(from);
  if (fallbackFrom && fallbackFrom !== 'auto') {
    try {
      return finish(await viaMyMemory(ctx, shielded.text, fallbackFrom, to), 'mymemory');
    } catch (e) {
      if (e?.code === 'BUDGET') sawBudget = true;
      if (e?.name === 'AbortError' && ctx.signal?.aborted) throw e;
    }
  }

  return { text, engine: sawBudget ? 'budget' : 'none' };
}

/* -------------------------------------------------------------------- cache */

/**
 * JSON-file cache with atomic writes (temp file + rename in the same directory).
 *
 * Shape: { "version": 1, "entries": { "<key>": { "t": "...", "d": "...", "at": "ISO" } } }
 * `t` is the translated text, `d` the source text it replaced (kept so a stale
 * entry can be spotted by a human), `at` the ISO timestamp of the write.
 * A missing or corrupt file is treated as an empty cache, never as an error.
 */
export function createCache(filePath) {
  const file = resolve(String(filePath));
  const entries = new Map();
  let loaded = false;
  let dirty = false;
  let hits = 0;
  let misses = 0;
  let saving = null;

  function load() {
    if (loaded) return;
    loaded = true;
    try {
      if (!existsSync(file)) return;
      const raw = readFileSync(file, 'utf8');
      if (!raw.trim()) return;
      const parsed = JSON.parse(raw);
      const bag = parsed && typeof parsed === 'object' ? (parsed.entries ?? {}) : {};
      if (!bag || typeof bag !== 'object') return;
      for (const [key, value] of Object.entries(bag)) {
        if (value && typeof value === 'object') {
          entries.set(key, {
            t: typeof value.t === 'string' ? value.t : '',
            d: typeof value.d === 'string' ? value.d : '',
            at: typeof value.at === 'string' ? value.at : new Date(0).toISOString(),
          });
        }
      }
    } catch {
      /* corrupt cache: start empty, keep the file for the next save to replace */
    }
  }

  function snapshot() {
    const bag = {};
    for (const [key, value] of entries) bag[key] = value;
    return JSON.stringify({ version: CACHE_VERSION, entries: bag }, null, 2);
  }

  async function writeAtomically() {
    const payload = snapshot();
    const dir = dirname(file);
    await mkdir(dir, { recursive: true });
    const tmp = `${file}.${process.pid}.${Date.now().toString(36)}.${Math.random().toString(36).slice(2, 8)}.tmp`;
    await writeFile(tmp, payload, 'utf8');
    // Windows can transiently refuse the rename if the destination is open.
    for (let attempt = 0; ; attempt++) {
      try {
        await rename(tmp, file);
        return;
      } catch (e) {
        if (attempt >= 3) throw e;
        await sleep(40 * (attempt + 1));
      }
    }
  }

  return {
    get(key) {
      load();
      const hit = entries.get(key);
      if (hit) hits += 1;
      else misses += 1;
      return hit ?? null;
    },
    set(key, value) {
      load();
      const t = typeof value?.t === 'string' ? value.t : '';
      const d = typeof value?.d === 'string' ? value.d : '';
      entries.set(key, { t, d, at: typeof value?.at === 'string' ? value.at : new Date().toISOString() });
      dirty = true;
    },
    /** Coalesces concurrent saves; resolves once the file on disk is current. */
    async save() {
      if (saving) return saving;
      saving = (async () => {
        try {
          if (!dirty) return;
          // Clear first: a set() that lands during the write re-arms `dirty`
          // instead of being swallowed by the completion of this save.
          dirty = false;
          await writeAtomically();
        } catch (e) {
          dirty = true;
          throw e;
        } finally {
          saving = null;
        }
      })();
      return saving;
    },
    stats() {
      load();
      return { size: entries.size, hits, misses, dirty, path: file };
    },
  };
}

/* ---------------------------------------------------------------- public API */

/**
 * Translate one string to French.
 * Always resolves to a string: the original is returned when every engine fails.
 *
 * `fetchImpl` / `timeoutMs` / `signal` are optional seams; the documented
 * call shape is `translateText(text, { from, to })`.
 */
export async function translateText(text, { from = 'auto', to = DEFAULT_TO, fetchImpl, timeoutMs = REQUEST_TIMEOUT_MS, signal } = {}) {
  if (typeof text !== 'string' || text.trim() === '') return typeof text === 'string' ? text : '';
  const ctx = createContext({ signal, fetchImpl, timeoutMs, budget: DEFAULT_BUDGET });
  try {
    const { text: out } = await translateOne(ctx, text, from, to);
    return out;
  } catch {
    return text;
  }
}

/** Engine label for an item, ordered by priority and de-duplicated. */
function combineEngines(engines) {
  const uniq = [...new Set(engines.filter(Boolean))];
  if (uniq.length === 0) return 'none';
  if (uniq.length === 1) return uniq[0];
  return uniq.sort((a, b) => ENGINE_PRIORITY.indexOf(a) - ENGINE_PRIORITY.indexOf(b)).join('+');
}

/**
 * Translate a batch of news items.
 *
 * entries: [{ id, title, description, lang }]
 * result:  [{ id, title, description, originalTitle, originalDescription,
 *             translated, engine }]  — same order, same ids, same length.
 *
 * Options:
 *   to           target language, default 'fr'
 *   concurrency  items in flight, default 4 (see TRANSLATE-NOTES on 429s)
 *   cache        object from createCache(); persisted automatically at the end
 *   budget       max outbound attempts for the whole run, default 300
 *   fetchImpl    fetch replacement (test seam / custom dispatcher)
 *   signal       AbortSignal for the whole run
 */
export async function translateBatch(entries, options = {}) {
  const {
    to = DEFAULT_TO,
    concurrency = DEFAULT_CONCURRENCY,
    cache = null,
    budget = DEFAULT_BUDGET,
    fetchImpl,
    timeoutMs = REQUEST_TIMEOUT_MS,
    signal,
    autoSave = true,
  } = options;

  if (!Array.isArray(entries) || entries.length === 0) return [];

  const target = baseLang(to) || DEFAULT_TO;
  const ctx = createContext({ signal, fetchImpl, timeoutMs, budget });
  const lanes = Math.max(1, Math.min(Number.isFinite(concurrency) && concurrency > 0 ? Math.floor(concurrency) : DEFAULT_CONCURRENCY, 32));

  /** Resolve one field: cache, then engines, then the untouched original. */
  async function translateField(text, from, engines) {
    const original = typeof text === 'string' ? text : '';
    if (!isTranslatable(original)) {
      if (original) engines.push('passthrough');
      return original;
    }
    if (baseLang(from) === target) {
      engines.push('passthrough');
      return original;
    }
    const key = cacheKey(from, original, target);
    const hit = cache ? cache.get(key) : null;
    if (hit && typeof hit.t === 'string' && hit.t.trim()) {
      engines.push('cache');
      return hit.t;
    }
    const { text: out, engine } = await translateOne(ctx, original, from, target);
    engines.push(engine);
    const changed = engine === 'google' || engine === 'mymemory';
    if (changed && cache) cache.set(key, { t: out, d: original });
    return changed ? out : original;
  }

  const results = new Array(entries.length);
  let cursor = 0;

  async function worker() {
    while (cursor < entries.length) {
      const index = cursor++;
      const entry = entries[index] && typeof entries[index] === 'object' ? entries[index] : {};
      const title = typeof entry.title === 'string' ? entry.title : '';
      const description = typeof entry.description === 'string' ? entry.description : '';
      const from = typeof entry.lang === 'string' && entry.lang.trim() ? entry.lang.trim() : 'auto';
      const engines = [];

      // French sources never touch the network and keep their exact bytes.
      if (baseLang(from) === target) {
        results[index] = {
          id: entry.id,
          title,
          description,
          originalTitle: title,
          originalDescription: description,
          translated: false,
          engine: 'passthrough',
        };
        continue;
      }

      let outTitle = title;
      let outDescription = description;
      try {
        outTitle = await translateField(title, from, engines);
        outDescription = await translateField(description, from, engines);
      } catch (e) {
        // Abort is the only failure allowed to escape; per-item errors degrade.
        if (e?.name === 'AbortError' && signal?.aborted) throw e;
      }

      results[index] = {
        id: entry.id,
        title: outTitle,
        description: outDescription,
        originalTitle: title,
        originalDescription: description,
        translated: engines.some((e) => e === 'google' || e === 'mymemory' || e === 'cache'),
        engine: combineEngines(engines),
      };
    }
  }

  await Promise.all(Array.from({ length: Math.min(lanes, entries.length) }, worker));

  if (cache && autoSave && typeof cache.save === 'function') {
    try {
      await cache.save();
    } catch {
      /* a cache write failure must not fail the batch */
    }
  }

  return results;
}
