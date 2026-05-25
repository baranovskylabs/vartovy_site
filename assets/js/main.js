/* Vartovy site — minimal vanilla JS: nav, theme, contact form. i18n lives in i18n.js */
(function () {
  'use strict';

  function tr(key, params) {
    if (window.VartovyI18n && typeof window.VartovyI18n.t === 'function') {
      return window.VartovyI18n.t(key, params);
    }
    return key;
  }

  // --- Theme ---
  const THEME_KEY = 'vartovy-theme';
  const root = document.documentElement;
  const saved = localStorage.getItem(THEME_KEY);
  if (saved === 'light' || saved === 'dark') {
    root.setAttribute('data-theme', saved);
  }

  function setTheme(next) {
    root.setAttribute('data-theme', next);
    try { localStorage.setItem(THEME_KEY, next); } catch (_) { }
    updateThemeButton(next);
  }
  function currentTheme() {
    return root.getAttribute('data-theme') || 'dark';
  }
  function updateThemeButton(theme) {
    document.querySelectorAll('.theme-toggle').forEach((btn) => {
      btn.textContent = theme === 'light' ? tr('theme.toDark') : tr('theme.toLight');
      btn.setAttribute('aria-label', tr('theme.toggleLabel'));
    });
  }

  document.addEventListener('click', function (e) {
    // Тимчасова заглушка для checkout-кнопок поки Paddle не верифіковано.
    const checkout = e.target.closest('[data-checkout]');
    if (checkout && checkout.getAttribute('aria-disabled') === 'true') {
      e.preventDefault();
      alert(
        'Платіжна інтеграція проходить верифікацію.\n\n' +
        'Якщо хочете отримати Pro-ключ за Early Bird ціною $29 одразу після запуску — ' +
        'напишіть на support@vartovy.app, ми збережемо ваше місце у перших 1000 покупців.'
      );
      return;
    }

    const t = e.target.closest('.theme-toggle');
    if (t) {
      setTheme(currentTheme() === 'light' ? 'dark' : 'light');
    }
    const navBtn = e.target.closest('.nav-toggle');
    if (navBtn) {
      const links = document.querySelector('.nav-links');
      if (links) links.classList.toggle('is-open');
    }
  });

  document.addEventListener('vartovy:langchange', function () {
    updateThemeButton(currentTheme());
  });

  // --- Active nav link ---
  function markActive() {
    const path = location.pathname.split('/').pop() || 'index.html';
    document.querySelectorAll('.nav-links a').forEach((a) => {
      const href = (a.getAttribute('href') || '').split('/').pop();
      if (href === path) a.classList.add('is-active');
    });
  }

  // --- Footer year ---
  function setYear() {
    const el = document.getElementById('year');
    if (el) el.textContent = String(new Date().getFullYear());
  }

  document.addEventListener('DOMContentLoaded', function () {
    updateThemeButton(currentTheme());
    markActive();
    setYear();
    initContactForm();
    initVoiceInput();
    cleanLegacyParams();
  });

  // --- Contact form ---
  const RATE_KEY = 'vartovy-contact-submissions';
  const RATE_LIMIT = 2;
  const RATE_WINDOW_MS = 24 * 60 * 60 * 1000;
  const MIN_FILL_TIME_MS = 3000;

  function safeStorage() {
    try { return window.localStorage; } catch (_) { return null; }
  }

  function getRecentSubmissions() {
    const ls = safeStorage();
    if (!ls) return [];
    try {
      const raw = ls.getItem(RATE_KEY);
      if (!raw) return [];
      const arr = JSON.parse(raw);
      if (!Array.isArray(arr)) return [];
      const now = Date.now();
      return arr.filter((t) => typeof t === 'number' && now - t < RATE_WINDOW_MS);
    } catch (_) {
      return [];
    }
  }

  function recordSubmission() {
    const ls = safeStorage();
    if (!ls) return;
    const list = getRecentSubmissions();
    list.push(Date.now());
    try { ls.setItem(RATE_KEY, JSON.stringify(list)); } catch (_) { }
  }

  function formatHoursLeft(submissions) {
    const oldest = Math.min.apply(null, submissions);
    const msLeft = RATE_WINDOW_MS - (Date.now() - oldest);
    return Math.max(1, Math.ceil(msLeft / (60 * 60 * 1000)));
  }

  function setStatus(el, text, type) {
    if (!el) return;
    el.textContent = text || '';
    el.classList.remove('is-error', 'is-success');
    if (type) el.classList.add('is-' + type);
  }

  function initContactForm() {
    const form = document.getElementById('contactForm');
    if (!form) return;

    const opened = document.getElementById('formOpenedAt');
    const status = document.getElementById('contactStatus');
    const submit = document.getElementById('contactSubmit');
    const openedAt = Date.now();
    if (opened) opened.value = String(openedAt);

    // Tracks the latest "sticky" status so we can re-render it (with the
    // freshly localized copy) whenever the language changes.
    // shape: { key: 'form.rateExhausted'|'form.rateLimit'|..., type: 'error'|'success'|null, dynamic: bool }
    let lastStatus = null;

    function showStatus(key, type, opts) {
      opts = opts || {};
      const params = key === 'form.rateExhausted' || key === 'form.rateLimit'
        ? { h: formatHoursLeft(getRecentSubmissions()) }
        : null;
      setStatus(status, tr(key, params || undefined), type);
      if (opts.sticky) lastStatus = { key: key, type: type };
      else lastStatus = null;
    }

    function clearStatus() {
      lastStatus = null;
      setStatus(status, '', null);
    }

    function refreshRateState() {
      const recent = getRecentSubmissions();
      if (recent.length >= RATE_LIMIT) {
        showStatus('form.rateExhausted', 'error', { sticky: true });
        if (submit) submit.disabled = true;
      } else if (lastStatus && lastStatus.key === 'form.rateExhausted') {
        clearStatus();
        if (submit) submit.disabled = false;
      } else if (lastStatus) {
        // Re-render any sticky message in the new language.
        showStatus(lastStatus.key, lastStatus.type, { sticky: true });
      }
    }

    refreshRateState();
    document.addEventListener('vartovy:langchange', refreshRateState);

    // Show success if redirected back from FormSubmit (?sent=1)
    var sentParam = new URLSearchParams(location.search);
    if (sentParam.get('sent') === '1') {
      recordSubmission();
      showStatus('form.success', 'success', { sticky: true });
      refreshRateState();
      if (history.replaceState) {
        history.replaceState(null, '', location.pathname + location.hash);
      }
    }

    form.addEventListener('submit', function (e) {
      e.preventDefault();

      const hp = form.querySelector('input[name="_honey"]');
      if (hp && hp.value.trim() !== '') {
        showStatus('form.honeypot', 'error');
        return;
      }

      if (Date.now() - openedAt < MIN_FILL_TIME_MS) {
        showStatus('form.tooFast', 'error');
        return;
      }

      const recent = getRecentSubmissions();
      if (recent.length >= RATE_LIMIT) {
        showStatus('form.rateLimit', 'error', { sticky: true });
        if (submit) submit.disabled = true;
        return;
      }

      const consentEl = form.querySelector('input[name="consent"]');
      if (!consentEl || !consentEl.checked) {
        if (consentEl) {
          consentEl.setCustomValidity(tr('form.consentRequired') || 'You must agree to the Privacy Policy and Terms of Use.');
          form.reportValidity();
          consentEl.setCustomValidity('');
        }
        return;
      }

      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }

      showStatus('form.sending', null);
      if (submit) submit.disabled = true;

      // Disable tracking field so it doesn't appear as clutter in the email
      var openedAtField = form.querySelector('#formOpenedAt');
      if (openedAtField) openedAtField.disabled = true;

      // Standard HTML form submit — FormSubmit sends email and redirects to _next (?sent=1)
      form.submit();
    });
  }

  function initVoiceInput() {
    var btn = document.getElementById('voiceBtn');
    if (!btn) return;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { btn.hidden = true; return; }

    var textarea = document.querySelector('textarea[name="message"]');
    if (!textarea) return;

    var rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.maxAlternatives = 1;

    var listening = false;
    var baseText = '';
    var langMap = {
      'en':'en-GB','uk':'uk-UA','es':'es-ES','fr':'fr-FR','de':'de-DE',
      'it':'it-IT','pt':'pt-PT','pl':'pl-PL','nl':'nl-NL','sv':'sv-SE',
      'no':'nb-NO','fi':'fi-FI','cs':'cs-CZ','el':'el-GR','tr':'tr-TR',
      'ar':'ar-SA','hi':'hi-IN','ja':'ja-JP','ko':'ko-KR','zh':'zh-CN'
    };

    function getLang() {
      try {
        var cur = window.VartovyI18n && VartovyI18n.current ? VartovyI18n.current : 'uk';
        return langMap[cur] || document.documentElement.lang || 'uk-UA';
      } catch (e) { return document.documentElement.lang || 'uk-UA'; }
    }

    rec.onresult = function (e) {
      var interim = '', finalStr = '';
      for (var i = e.resultIndex; i < e.results.length; i++) {
        var t = e.results[i][0].transcript;
        if (e.results[i].isFinal) finalStr += t;
        else interim += t;
      }
      if (finalStr) {
        var sep = baseText && !/\s$/.test(baseText) ? ' ' : '';
        baseText += sep + finalStr.trim();
      }
      textarea.value = baseText + (interim ? (baseText ? ' ' : '') + interim : '');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    };

    rec.onerror = function (e) {
      if (e.error !== 'no-speech' && e.error !== 'aborted') stop();
    };

    rec.onend = function () {
      if (listening) { try { rec.start(); } catch (_) { stop(); } }
    };

    function start() {
      baseText = textarea.value;
      rec.lang = getLang();
      try { rec.start(); } catch (_) { return; }
      listening = true;
      btn.classList.add('is-listening');
      btn.title = 'Stop recording';
      btn.setAttribute('aria-label', 'Stop recording');
    }

    function stop() {
      listening = false;
      rec.stop();
      btn.classList.remove('is-listening');
      btn.title = 'Voice input';
      btn.setAttribute('aria-label', 'Voice input');
    }

    btn.addEventListener('click', function (e) {
      e.preventDefault(); e.stopPropagation();
      if (listening) stop(); else start();
    });

    var form = document.getElementById('contactForm');
    if (form) form.addEventListener('submit', function () { if (listening) stop(); });
  }

  function cleanLegacyParams() {
    const params = new URLSearchParams(location.search);
    if (params.get('sent') !== '1') return;
    if (history.replaceState) {
      const clean = location.pathname + location.hash;
      history.replaceState(null, '', clean);
    }
  }
})();
