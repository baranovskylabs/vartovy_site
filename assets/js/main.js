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

      const data = new FormData(form);
      const payload = {};
      data.forEach((v, k) => { payload[k] = v; });

      fetch(form.action, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Accept': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((res) => res.json().catch(() => ({})).then((body) => ({ ok: res.ok, body })))
        .then(({ ok, body }) => {
          if (!ok || !body || body.success === 'false' || body.success === false) {
            showStatus('form.error', 'error');
            if (submit) submit.disabled = false;
            return;
          }
          recordSubmission();
          form.reset();
          showStatus('form.success', 'success', { sticky: true });
          const after = getRecentSubmissions();
          if (after.length < RATE_LIMIT && submit) submit.disabled = false;
          else if (submit) submit.disabled = true;
        })
        .catch(() => {
          showStatus('form.network', 'error');
          if (submit) submit.disabled = false;
        });
    });
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
