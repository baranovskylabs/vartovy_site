/* Vartovy i18n — fully automatic translator.
 * - Walks DOM text nodes + key attributes (placeholder, title, alt, aria-label).
 * - Stores originals in a WeakMap so language can be switched many times.
 * - Translates via Google Translate JSON endpoint (no widget, no banner).
 * - Caches every translation in localStorage so subsequent switches are instant.
 * - Skips <script>, <style>, <code>, <pre> and any [data-no-translate] subtree.
 * - Public API: VartovyI18n.{ LANGS, getLang, setLang, apply, t, translateElement }.
 */
(function () {
  'use strict';

  var STORAGE_KEY = 'vartovy-lang';
  var CACHE_KEY   = 'vartovy-mt-cache-v2';
  var DEFAULT_LANG = 'en';
  var SOURCE_LANG  = 'auto'; // let Google detect (HTML is mixed UA/EN now)

  var LANGS = [
    { code: 'en', name: 'English',     cc: 'GB' },
    { code: 'uk', name: 'Українська',  cc: 'UA' },
    { code: 'es', name: 'Español',     cc: 'ES' },
    { code: 'fr', name: 'Français',    cc: 'FR' },
    { code: 'de', name: 'Deutsch',     cc: 'DE' },
    { code: 'it', name: 'Italiano',    cc: 'IT' },
    { code: 'pt', name: 'Português',   cc: 'PT' },
    { code: 'pl', name: 'Polski',      cc: 'PL' },
    { code: 'nl', name: 'Nederlands',  cc: 'NL' },
    { code: 'sv', name: 'Svenska',     cc: 'SE' },
    { code: 'no', name: 'Norsk',       cc: 'NO' },
    { code: 'fi', name: 'Suomi',       cc: 'FI' },
    { code: 'cs', name: 'Čeština',     cc: 'CZ' },
    { code: 'el', name: 'Ελληνικά',    cc: 'GR' },
    { code: 'tr', name: 'Türkçe',      cc: 'TR' },
    { code: 'ar', name: 'العربية',     cc: 'SA' },
    { code: 'hi', name: 'हिन्दी',         cc: 'IN' },
    { code: 'ja', name: '日本語',        cc: 'JP' },
    { code: 'ko', name: '한국어',        cc: 'KR' },
    { code: 'zh', name: '中文',          cc: 'CN' },
  ];

  // Strings produced by JS need direct translations. Running the full DOM
  // translator from a language-change listener creates an event loop.
  var UI_STRINGS = {
    en: {
      'theme.toLight':      'Light',
      'theme.toDark':       'Dark',
      'theme.toggleLabel':  'Toggle color theme',
      'form.sending':       'Sending...',
      'form.success':       'Thank you! Your message has been sent. We will reply soon.',
      'form.error':         'Could not send. Please try again later.',
      'form.network':       'Network error. Check your connection and try again.',
      'form.honeypot':      'Could not send.',
      'form.tooFast':       'Please fill out the form more carefully.',
      'form.rateLimit':     'Limit: 2 messages per day. Try again in ~{h}h.',
      'form.rateExhausted': 'Limit reached. Try again in ~{h}h.',
    },
    uk: {
      'theme.toLight':      'Світла',
      'theme.toDark':       'Темна',
      'theme.toggleLabel':  'Перемкнути колірну тему',
      'form.sending':       'Надсилаємо...',
      'form.success':       'Дякуємо! Ваш лист надіслано. Ми відповімо найближчим часом.',
      'form.error':         'Не вдалось надіслати. Спробуйте ще раз пізніше.',
      'form.network':       'Помилка мережі. Перевірте з\'єднання та спробуйте ще раз.',
      'form.honeypot':      'Не вдалось надіслати.',
      'form.tooFast':       'Будь ласка, заповніть форму уважніше.',
      'form.rateLimit':     'Ліміт 2 повідомлень на день. Спробуйте через ~{h} год.',
      'form.rateExhausted': 'Ліміт вичерпано. Спробуйте через ~{h} год.',
    },
  };

  // ---------- storage ----------
  function getLang() {
    try { return localStorage.getItem(STORAGE_KEY) || DEFAULT_LANG; }
    catch (_) { return DEFAULT_LANG; }
  }
  function setLangValue(code) {
    try { localStorage.setItem(STORAGE_KEY, code); } catch (_) {}
  }

  var cache;
  function loadCache() {
    if (cache) return cache;
    try { cache = JSON.parse(localStorage.getItem(CACHE_KEY) || '{}') || {}; }
    catch (_) { cache = {}; }
    return cache;
  }
  function saveCache() {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(cache || {})); } catch (_) {}
  }

  // ---------- DOM walking ----------
  var nodeOrig = new WeakMap(); // text node -> original value
  var attrOrig = new WeakMap(); // element -> { attr: original }

  var ATTRS = ['placeholder', 'title', 'alt', 'aria-label'];

  function shouldSkipParent(parent) {
    if (!parent || parent.nodeType !== 1) return true;
    var tag = parent.nodeName;
    if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT' ||
        tag === 'CODE'   || tag === 'PRE') return true;
    if (parent.closest && parent.closest('[data-no-translate], code, pre, .lang-switcher-mount')) return true;
    return false;
  }

  function collectTextItems(root) {
    var items = [];
    var walker = document.createTreeWalker(root || document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (node) {
        if (shouldSkipParent(node.parentNode)) return NodeFilter.FILTER_REJECT;
        var v = node.nodeValue;
        if (!v || !v.trim()) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var n;
    while ((n = walker.nextNode())) {
      if (!nodeOrig.has(n)) nodeOrig.set(n, n.nodeValue);
      items.push({ kind: 'text', node: n, original: nodeOrig.get(n) });
    }
    return items;
  }

  // Document <title> and selected <meta> entries (description / og:*).
  // We treat them as virtual "items" so they go through the same
  // restore/translate/cache pipeline as DOM text and attributes.
  var headOrig = { title: null, metas: new WeakMap() };
  function collectHeadItems() {
    if (!document.head) return [];
    var items = [];
    var titleEl = document.querySelector('title');
    if (titleEl && titleEl.textContent && titleEl.textContent.trim()) {
      if (headOrig.title == null) headOrig.title = titleEl.textContent;
      items.push({
        kind: 'title',
        original: headOrig.title,
        set: function (v) { titleEl.textContent = v; },
      });
    }
    var metaSel = 'meta[name="description"], meta[property="og:title"], meta[property="og:description"]';
    document.querySelectorAll(metaSel).forEach(function (m) {
      var v = m.getAttribute('content');
      if (!v || !v.trim()) return;
      if (!headOrig.metas.has(m)) headOrig.metas.set(m, v);
      items.push({
        kind: 'meta',
        original: headOrig.metas.get(m),
        set: (function (el) { return function (val) { el.setAttribute('content', val); }; })(m),
      });
    });
    return items;
  }

  function collectAttrItems(root) {
    var items = [];
    var scope = root || document.body;
    var els = scope.querySelectorAll('[placeholder],[title],[alt],[aria-label]');
    els.forEach(function (el) {
      if (shouldSkipParent(el.parentNode) || (el.closest && el.closest('[data-no-translate]'))) return;
      var map = attrOrig.get(el);
      ATTRS.forEach(function (a) {
        if (!el.hasAttribute(a)) return;
        var v = el.getAttribute(a);
        if (!v || !v.trim()) return;
        if (!map) { map = {}; attrOrig.set(el, map); }
        if (!(a in map)) map[a] = v;
        items.push({ kind: 'attr', el: el, attr: a, original: map[a] });
      });
    });
    return items;
  }

  function collectAll(root) {
    var items = collectTextItems(root).concat(collectAttrItems(root));
    // Head items only when translating the whole document, not a subtree.
    if (!root) items = items.concat(collectHeadItems());
    return items;
  }

  // ---------- translation ----------
  function cacheKey(target, source, text) {
    return target + '|' + source + '|' + text;
  }

  // Build a translate URL. The Google gtx endpoint is more reliable with one
  // text per request; multiple &q= entries can be ignored in some browsers.
  function buildUrl(texts, target, source) {
    var qs = '';
    for (var i = 0; i < texts.length; i++) qs += '&q=' + encodeURIComponent(texts[i]);
    return 'https://translate.googleapis.com/translate_a/single' +
           '?client=gtx&sl=' + encodeURIComponent(source) +
           '&tl=' + encodeURIComponent(target) +
           '&dt=t' + qs;
  }

  // Fetch one text with timeout.
  function fetchOne(text, target, source) {
    var url = buildUrl([text], target, source);
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = setTimeout(function () { if (ctrl) ctrl.abort(); }, 6000);
    var opts = ctrl ? { signal: ctrl.signal } : {};
    return fetch(url, opts).then(function (r) {
      clearTimeout(timer);
      if (!r.ok) throw new Error('http ' + r.status);
      return r.json();
    }).then(function (j) {
      var out = '';
      if (Array.isArray(j) && Array.isArray(j[0])) {
        j[0].forEach(function (seg) { if (seg && seg[0]) out += seg[0]; });
      }
      return out || text;
    }).catch(function () {
      clearTimeout(timer);
      return text;
    });
  }

  // Fetch a batch. Each item is requested separately because the endpoint can
  // silently translate only the first q= value when several are sent together.
  function fetchBatch(texts, target, source) {
    return Promise.all(texts.map(function (text) {
      return fetchOne(text, target, source);
    }));
  }

  // Build batches that fit in the URL length limit. URLs over ~2000 chars are
  // unreliable; we cap by encoded length AND by item count.
  function buildBatches(texts) {
    var batches = [];
    var cur = [];
    var curLen = 0;
    var MAX_URL = 1400;
    var MAX_ITEMS = 25;
    for (var i = 0; i < texts.length; i++) {
      var t = texts[i];
      var add = encodeURIComponent(t).length + 5; // "&q=" + value
      if (cur.length && (curLen + add > MAX_URL || cur.length >= MAX_ITEMS)) {
        batches.push(cur); cur = []; curLen = 0;
      }
      cur.push(t);
      curLen += add;
    }
    if (cur.length) batches.push(cur);
    return batches;
  }

  // Translate a list of unique strings; returns map original->translated.
  // Runs batches with limited concurrency so the network/UI stays responsive.
  function translateMany(originals, target, source) {
    loadCache();
    var result = {};
    var todo = [];
    originals.forEach(function (s) {
      var k = cacheKey(target, source, s);
      if (cache[k] != null) result[s] = cache[k];
      else todo.push(s);
    });
    if (todo.length === 0) return Promise.resolve(result);

    var batches = buildBatches(todo);
    var CONC = 3;
    var bi = 0;
    function runOne() {
      if (bi >= batches.length) return Promise.resolve();
      var batch = batches[bi++];
      return fetchBatch(batch, target, source).then(function (translated) {
        for (var i = 0; i < batch.length; i++) {
          var src = batch[i];
          var tr = translated[i] || src;
          result[src] = tr;
          cache[cacheKey(target, source, src)] = tr;
        }
        return runOne();
      });
    }
    var pool = [];
    for (var p = 0; p < Math.min(CONC, batches.length); p++) pool.push(runOne());
    return Promise.all(pool).then(function () { saveCache(); return result; });
  }

  // ---------- apply ----------
  function restoreOriginals(items) {
    items.forEach(function (it) {
      if (it.kind === 'text') it.node.nodeValue = it.original;
      else if (it.kind === 'attr') it.el.setAttribute(it.attr, it.original);
      else if (typeof it.set === 'function') it.set(it.original);
    });
  }

  function setTranslated(items, translations) {
    items.forEach(function (it) {
      var key = it.original.trim();
      var tr = translations[key];
      if (it.kind === 'text') {
        if (tr) {
          var lead  = it.original.match(/^\s*/)[0];
          var trail = it.original.match(/\s*$/)[0];
          it.node.nodeValue = lead + tr + trail;
        } else {
          it.node.nodeValue = it.original;
        }
      } else if (it.kind === 'attr') {
        it.el.setAttribute(it.attr, tr || it.original);
      } else if (typeof it.set === 'function') {
        it.set(tr || it.original);
      }
    });
  }

  var applying = false;
  function apply(root) {
    if (applying) return Promise.resolve();
    var lang = getLang();
    document.documentElement.setAttribute('lang', lang);
    var items = collectAll(root);
    // Always start from originals so previously translated nodes are re-translatable.
    restoreOriginals(items);

    if (items.length === 0) {
      document.dispatchEvent(new CustomEvent('vartovy:langchange', { detail: { lang: lang } }));
      return Promise.resolve();
    }

    // Use 'auto' source so mixed-language pages still work.
    var unique = [];
    var seen = {};
    items.forEach(function (it) {
      var k = it.original.trim();
      if (k && !seen[k]) { seen[k] = 1; unique.push(k); }
    });

    applying = true;
    document.body.setAttribute('data-translating', '1');
    return translateMany(unique, lang, SOURCE_LANG).then(function (translations) {
      setTranslated(items, translations);
      applying = false;
      document.body.removeAttribute('data-translating');
      document.dispatchEvent(new CustomEvent('vartovy:langchange', { detail: { lang: lang } }));
    }).catch(function () {
      applying = false;
      document.body.removeAttribute('data-translating');
    });
  }

  // Re-translate a single element (after JS modifies its text content).
  function translateElement(el) {
    if (!el) return Promise.resolve();
    return apply(el);
  }

  // Returns a string for the selected UI language, with {param} interpolation.
  function t(key, params) {
    var lang = getLang();
    var table = UI_STRINGS[lang] || UI_STRINGS.en;
    var s = table[key] || UI_STRINGS.en[key];
    if (s == null) return key;
    if (params) {
      Object.keys(params).forEach(function (k) {
        s = s.replace(new RegExp('\\{' + k + '\\}', 'g'), params[k]);
      });
    }
    return s;
  }

  // ---------- language switcher UI ----------
  function buildLangSwitcher() {
    var mounts = document.querySelectorAll('.lang-switcher-mount');
    if (!mounts.length) return;
    var cur = getLang();
    mounts.forEach(function (mount) {
      mount.innerHTML = '';
      var sel = document.createElement('select');
      sel.className = 'lang-select';
      sel.setAttribute('aria-label', 'Language');
      sel.setAttribute('data-no-translate', '');
      LANGS.forEach(function (l) {
        var opt = document.createElement('option');
        opt.value = l.code;
        opt.textContent = l.name + ' (' + l.cc + ')';
        if (l.code === cur) opt.selected = true;
        sel.appendChild(opt);
      });
      sel.addEventListener('change', function () {
        var code = sel.value;
        setLangValue(code);
        // Sync all switchers
        document.querySelectorAll('.lang-select').forEach(function (s) { s.value = code; });
        apply();
      });
      mount.appendChild(sel);
    });
  }

  // ---------- public ----------
  window.VartovyI18n = {
    LANGS: LANGS,
    getLang: getLang,
    setLang: function (code) { setLangValue(code); return apply(); },
    apply: apply,
    translateElement: translateElement,
    t: t,
  };

  document.addEventListener('DOMContentLoaded', function () {
    buildLangSwitcher();
    apply();
  });
})();
