/* Vartovy — versions.html dynamic loader.
 * Reads /downloads/releases.json and renders an archive of all builds
 * with release notes, files and SHA-256 hashes.
 * No build step, no framework. Plain DOM.
 */
(function () {
  'use strict';

  var MOUNT_ID = 'releases-list';
  // Resolve path relative to site root so it works from /pages/versions.html
  // and any future /pages/* sub-route.
  var MANIFEST_URL = '../downloads/releases.json';

  function el(tag, attrs, children) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k === 'html') node.innerHTML = attrs[k];
        else node.setAttribute(k, attrs[k]);
      });
    }
    if (children) {
      (Array.isArray(children) ? children : [children]).forEach(function (c) {
        if (c == null) return;
        node.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
      });
    }
    return node;
  }

  function shortHash(h) {
    if (!h || h.length < 16) return h || '';
    return h.slice(0, 8).toUpperCase() + '…' + h.slice(-8).toUpperCase();
  }

  function humanSize(bytes) {
    if (typeof bytes !== 'number') return '';
    if (bytes >= 1024 * 1024) return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    if (bytes >= 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return bytes + ' B';
  }

  function renderRelease(rel, isLatest) {
    var head = el('div', { class: 'release-head' }, [
      el('div', { class: 'release-title' }, [
        el('h3', { text: rel.title || ('Vartovy ' + rel.version) }),
        el('div', { class: 'release-meta' }, [
          el('span', { class: 'release-version', text: 'v' + rel.version }),
          el('span', { class: 'dot-sep', text: '·' }),
          el('span', { text: rel.date || '' }),
          rel.channel ? el('span', { class: 'dot-sep', text: '·' }) : null,
          rel.channel ? el('span', { class: 'release-channel release-channel--' + rel.channel, text: rel.channel }) : null,
        ]),
      ]),
      isLatest ? el('span', { class: 'badge badge--brand', text: 'Остання' }) : null,
    ]);

    var summary = rel.summary
      ? el('p', { class: 'release-summary muted', text: rel.summary })
      : null;

    var highlights = null;
    if (Array.isArray(rel.highlights) && rel.highlights.length) {
      highlights = el('ul', { class: 'release-highlights' },
        rel.highlights.map(function (h) { return el('li', { text: h }); })
      );
    }

    var files = el('div', { class: 'release-files' },
      (rel.files || []).map(function (f) {
        var hashRow = f.sha256
          ? el('div', { class: 'file-hash' }, [
              el('span', { class: 'dim', text: 'SHA-256:' }),
              el('code', { title: f.sha256, text: shortHash(f.sha256) }),
            ])
          : null;

        return el('div', { class: 'file-row' }, [
          el('div', { class: 'file-info' }, [
            el('div', { class: 'file-label', text: f.label || f.filename }),
            el('div', { class: 'file-meta dim' }, [
              el('span', { text: (f.os || '') + (f.arch ? ' · ' + f.arch : '') }),
              el('span', { class: 'dot-sep', text: '·' }),
              el('span', { text: f.sizeHuman || humanSize(f.size) }),
            ]),
            hashRow,
          ]),
          el('a', {
            class: 'btn btn--primary',
            href: f.url,
            download: f.filename || '',
            'data-track': 'download-' + rel.version,
            rel: 'noopener',
            text: '⬇ Завантажити',
          }),
        ]);
      })
    );

    return el('article', { class: 'release-card' + (isLatest ? ' release-card--latest' : '') }, [
      head, summary, highlights, files,
    ]);
  }

  function render(manifest) {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    mount.innerHTML = '';
    var releases = manifest.releases || [];
    if (!releases.length) {
      mount.appendChild(el('p', { class: 'muted text-center', text: 'Поки що немає опублікованих версій.' }));
      return;
    }
    var latest = manifest.latest;
    releases.forEach(function (r) {
      mount.appendChild(renderRelease(r, r.version === latest));
    });
  }

  function renderError(err) {
    var mount = document.getElementById(MOUNT_ID);
    if (!mount) return;
    mount.innerHTML = '';
    mount.appendChild(el('div', { class: 'card' }, [
      el('h3', { text: 'Не вдалось завантажити список версій' }),
      el('p', { class: 'muted', text: 'Спробуйте оновити сторінку. Як обхідний шлях — пряме посилання на останню збірку:' }),
      el('p', null, [
        el('a', {
          class: 'btn btn--primary',
          href: '../downloads/Vartovy-1.0.0-x64-Portable.exe',
          download: 'Vartovy-1.0.0-x64-Portable.exe',
          rel: 'noopener',
          text: '⬇ Vartovy 1.0.0 Portable (95.3 MB)',
        }),
      ]),
      err && err.message ? el('p', { class: 'dim', text: 'Деталі: ' + err.message }) : null,
    ]));
  }

  function load() {
    fetch(MANIFEST_URL, { cache: 'no-cache' })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(render)
      .catch(renderError);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', load);
  } else {
    load();
  }
})();
