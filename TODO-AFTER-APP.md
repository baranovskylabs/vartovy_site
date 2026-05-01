# Vartovy — TODO після релізу основного застосунку

> Цей документ — список слабких сторін сайту й інфраструктури, які свідомо
> залишені на потім, поки фокус — на десктоп-застосунку.
> Повертатися сюди після того, як Vartovy app має робочий інсталятор і реліз.

---

## 1. Платіжна інтеграція (КРИТИЧНО)

- [ ] **Backend не задеплоєно у Supabase.** Папка `server/` готова, але не запущена.
  - Деплой `server/supabase/migrations/0001_init.sql`
  - Деплой Edge Functions: `lemon-webhook`, `activate`, `validate`, `deactivate`
  - Згенерувати Ed25519 ключі: `deno run server/scripts/generate-signing-keys.ts`
  - Виставити секрети у Supabase Dashboard
- [ ] **Переписати з Lemon Squeezy на Paddle** (Україна заблокована в Lemon).
  - Файл: `server/supabase/functions/_shared/lemon.ts` → `paddle.ts`
  - Webhook: `lemon-webhook/index.ts` → події `transaction.completed`, `subscription.canceled`, `subscription.past_due`
  - Підпис: HMAC-SHA256 з `PADDLE_NOTIFICATION_KEY`, заголовок `Paddle-Signature`
- [ ] **Підставити реальні значення в `assets/js/activate.js`:**
  - `SUPABASE_URL`
  - `SUPABASE_ANON_KEY`
  - Після цього банер «Активація поки не доступна» зникне автоматично.
- [ ] **Оновити кнопки checkout** у `pages/pricing.html`:
  - Замінити `href="#" data-checkout="pro"` на реальний Paddle checkout URL
  - Або підключити Paddle.js inline overlay (`data-display-mode="overlay"`)
  - Прибрати JS-заглушку у `assets/js/main.js` (блок `[data-checkout][aria-disabled="true"]`)
- [ ] **Email-доставка ключів активації:**
  - Підключити Resend / Postmark / Mailgun
  - Шаблон листа з ключем + інструкцією + посиланням на `pages/activate.html`
  - Webhook після `transaction.completed` має автоматично слати лист

**Альтернативи Paddle, якщо відмовлять:** Polar.sh (4%, Україна підтримана), Gumroad (10%, але універсальний).

---

## 2. Юридичні дані (КРИТИЧНО до публічного запуску)

- [ ] **Реєстрація ФОП в Україні** (бажано, але не обов'язково для Paddle MoR).
- [ ] **Заповнити плейсхолдери у `pages/privacy.html` та `pages/terms.html`:**
  - Зараз там TODO-коментарі: `<!-- TODO: вписати ПІБ ФОП після державної реєстрації -->`
  - Замінити "незалежний приватний творець" → реальне ПІБ + ЄДРПОУ/РНОКПП
  - Додати реальну адресу замість "Юрисдикція: Україна"
- [ ] **Перевірити дату:** наразі скрізь `29 April 2026`. Оновлювати при суттєвих змінах.
- [ ] **GDPR Data Processing Agreement (DPA)** — підготувати шаблон для корпоративних клієнтів, які питатимуть.
- [ ] **DMCA / Abuse policy** — окрема сторінка `pages/dmca.html` (бажано перед першими 100 продажами).

---

## 3. Безпека сайту

- [ ] **Перевірити CSP на проді** через https://csp-evaluator.withgoogle.com/.
  - Прибрати `'unsafe-inline'` зі `script-src` через nonce/hash, коли видалимо inline JS на index.html.
- [ ] **Subresource Integrity (SRI)** для зовнішніх скриптів (Paddle.js, Google Translate).
- [ ] **HSTS preload submission:** https://hstspreload.org/ після 60+ днів стабільної HSTS.
- [ ] **Rate limiting** на Supabase Edge Functions (зараз без захисту від брутфорсу ключів).
  - Додати rate-limit middleware або Cloudflare Turnstile перед формою активації.
- [ ] **Cloudflare Turnstile / hCaptcha** на:
  - `pages/contact.html` форма (FormSubmit вже має captcha-опцію `_captcha=true`)
  - `pages/activate.html` — захист від перебору ключів
- [ ] **Honeypot для форми активації** (як у contact-формі).
- [ ] **Аудит залежностей:** наразі `assets/js/i18n.js` тягне Google Translate — privacy-проблема для зеленого продукту. Подумати про власні переклади для UK/EN.
- [ ] **CSP report-uri** для відстеження порушень: https://report-uri.com/ або власний endpoint.
- [ ] **Penetration test** базової поверхні: ZAP/Burp passive scan після релізу.

---

## 4. SEO / Marketing

- [ ] **Конвертувати `assets/img/og-image.svg` у PNG 1200×630.**
  - `npm install -g svgexport && svgexport assets/img/og-image.svg assets/img/og-image.png 1200:630`
- [ ] **Apple Touch Icon** — `assets/img/apple-touch-icon.png` 180×180.
- [ ] **PWA manifest.json** з іконками 192/512 (опційно — сайт не PWA).
- [ ] **Google Search Console** — додати domain property, підтвердити DNS-record.
- [ ] **Bing Webmaster Tools** — додати sitemap.
- [ ] **Реальні скріншоти застосунку** замість CSS-mockup vault-card на index.html hero.
  - Зробити 3-5 скрінів: розблокування, головний екран, налаштування, recovery flow.
  - Покласти у `assets/img/screenshots/` і додати на `pages/features.html`.
- [ ] **Canonical posts / changelog page** — `pages/changelog.html` для SEO + довіри.
- [ ] **Article schema** для майбутніх блог-постів.
- [ ] **hreflang** теги, коли буде реальний UK/EN контент (зараз все uk + Google Translate).
- [ ] **Open Graph debug:** перевірити https://www.opengraph.xyz/url/vartovy.app після деплою.

---

## 5. Доступність (a11y)

- [ ] **Контраст** — перевірити `--text-dim` (#8b95a7?) на dark BG через axe DevTools.
- [ ] **Skip-to-content link** на початку `<body>`.
- [ ] **`<main>` має мати `id="main"`** для skip-link.
- [ ] **Focus styles:** `:focus-visible` для всіх інтерактивних елементів (зараз дефолтні).
- [ ] **`prefers-reduced-motion`** — поки не враховано в анімаціях card hover.
- [ ] **Alt-тексти:** `<img src="logo.png" alt="" />` у всіх `<header>` — це decorative, ОК. Перевірити майбутні скріншоти.
- [ ] **ARIA для FAQ `<details>`** — додати aria-expanded handling.
- [ ] **Тестування з NVDA/VoiceOver** після релізу основного UI.

---

## 6. Performance

- [ ] **Перевірити Lighthouse** після деплою (ціль: 95+ Performance, 100 Best Practices, 100 SEO, 95+ a11y).
- [ ] **Прелоад критичного CSS** через `<link rel="preload">` (тільки якщо Lighthouse вкаже).
- [ ] **WebP/AVIF** для скріншотів (PNG → WebP економить 30-50%).
- [ ] **Font subsetting** якщо колись підключатимемо Inter / JetBrains Mono локально.
- [ ] **Прибрати inline `<style>` з `pages/activate.html`** → перенести в `styles.css`.
- [ ] **i18n.js версіонування** — зараз `?v=8`, при кожному оновленні UI_STRINGS треба бампати.
- [ ] **Cloudflare Auto Minify** — увімкнути для HTML/CSS/JS у CF Dashboard.

---

## 7. Контент / UX дрібниці

- [ ] **Real testimonials** — додати секцію з 3-5 цитатами після перших 50 платних користувачів.
- [ ] **Логотипи "Featured in"** — після ProductHunt / HN / r/privacy згадок.
- [ ] **Динамічний лічильник проданих ключів** ("823 з 1000 Early Bird") — потребує API endpoint у Supabase.
  - Створити публічний `GET /functions/v1/early-bird-count`.
  - Підключити на `pages/pricing.html` через `fetch()`.
- [ ] **Чат-віджет** (Crisp/Tawk) — НІ, суперечить privacy-by-design. Залишити email-only.
- [ ] **Newsletter** через Buttondown або self-hosted Listmonk — для release notifications.
- [ ] **Affiliate program** для privacy-блогерів (15-20% comission через Paddle Partners).
- [ ] **Порівняння з конкурентами** — окрема сторінка `pages/compare.html`:
  - vs 1Password (cloud subscription)
  - vs Bitwarden (хмара, але self-hostable)
  - vs KeePass (offline, але дезорганізований UX)
  - vs Proton Pass (cloud, новий)
- [ ] **Roadmap page** — `pages/roadmap.html` з публічним планом (Decoy vault, browser extension, командний режим, тощо — зараз згадуються в features як "in roadmap" без деталей).

---

## 8. Інфраструктура / DevOps

- [ ] **GitHub Actions CI** для:
  - HTMLProofer (битих посилань, валідація)
  - Lighthouse CI (Performance regression)
  - Lint `_headers` синтаксису
- [ ] **Backup для Supabase БД** — Pro tier дає point-in-time recovery; на Free треба cron + pg_dump у R2.
- [ ] **Status page** — https://status.vartovy.app через UptimeRobot або Better Uptime (free tier).
- [ ] **Власний email-сендер з домену** (Resend/Postmark) замість пересилання на ProtonMail для transactional листів.
- [ ] **Monitoring:** Sentry (error tracking) для frontend JS errors. Або self-hosted GlitchTip.
- [ ] **Cloudflare Web Analytics** замість GA — privacy-friendly, безкоштовно.
- [ ] **Sentry на backend Edge Functions** для відстеження webhook-помилок.
- [ ] **Canary deploys** для змін у Edge Functions (через Supabase preview branches).

---

## 9. Локалізація

- [ ] **Прибрати залежність від Google Translate** в `assets/js/i18n.js`.
  - Створити справжні словники UK/EN/PL/DE для UI_STRINGS.
  - Залишити Google Translate тільки як fallback для решти мов (або взагалі прибрати — privacy concern).
- [ ] **Окремі URL для мов** — `/en/pricing.html` замість JS-перемикача (краще для SEO, hreflang).
- [ ] **RTL підтримка** — зараз не критично; додати `dir="auto"` тільки якщо буде Arabic/Hebrew переклад.

---

## 10. Юзабіліті активації

- [ ] **OCR автозаповнення з emailу** — drag & drop email-ліста або скріншоту → витягнути ключ. Низький пріоритет.
- [ ] **QR-код активації** для desktop-застосунку — користувач сканує телефоном замість копі-пейст.
- [ ] **«Забув ключ» flow** — restore by email + Paddle order ID.
- [ ] **Self-service deactivation** — зараз згадано що "у панелі ліцензій можна деактивувати ключ", але самої панелі немає. Створити `pages/license.html` з логіном через magic link.

---

## 11. Early Bird механіка (КРИТИЧНО — впливає на маркетинг)

### Аналіз: 1000 vs 5000 vs tiered pricing

| Варіант | Плюси | Мінуси |
|---|---|---|
| **1000 за $29** (поточно) | Реальний дефіцит, швидко закривається, чесно для нового продукту | Якщо не закривається — виглядає блідо |
| **5000 за $29** | Більший потенційний дохід ($145k vs $29k) | Слабкий FOMO, "5000 далеко" — не мотивує купити сьогодні |
| **Tiered** (100×$19 → 400×$24 → 500×$29 → далі $49) | Найсильніший urgency, релогічна цінова прогресія, дає матеріал для постів | Складніше пояснити, потрібен робочий лічильник з самого початку |

**Рекомендація:** залишити **1000 за $29** на launch. Якщо закриється швидше ніж за 6 міс — оголосити "Wave 2: ще 500 за $34" як окрему акцію. 5000 створює ризик виглядати порожньо. Tiered — логічно, але тільки коли є робочий бекенд для лічильника.

- [ ] **Не міняти 1000 → 5000 наосліп** (втрачається urgency).
- [ ] **Підготувати "Wave 2 / Wave 3" сценарій** на випадок швидкого розпродажу.
- [ ] **Розглянути tiered ціни** після першої сотні продажів (коли є дані про конверсію).

### Автоматичний лічильник проданих

**Чи технічно можливо:** Так, тривіально, але тільки після деплою backend.

**Архітектура:**
1. Створити публічну Edge Function `GET /functions/v1/early-bird-count`:
   ```ts
   // Повертає {sold: number, limit: number, remaining: number, percent: number}
   const { count } = await supabase
     .from('licenses')
     .select('*', { count: 'exact', head: true })
     .eq('plan', 'pro')
     .lte('created_at', EARLY_BIRD_END_DATE);
   ```
2. Кешувати у CF на 5–15 хв (`Cache-Control: public, max-age=600`) — щоб не довбати БД на кожен hit.
3. На `pages/pricing.html` додати:
   ```html
   <span class="early-bird-counter" data-eb-counter>
     <strong id="eb-sold">—</strong> з 1 000 продано
     <progress id="eb-bar" max="1000" value="0"></progress>
   </span>
   ```
4. JS у `assets/js/early-bird.js`:
   ```js
   fetch('https://your-project.supabase.co/functions/v1/early-bird-count')
     .then(r => r.json())
     .then(({sold, limit}) => {
       document.getElementById('eb-sold').textContent = sold.toLocaleString('uk');
       document.getElementById('eb-bar').value = sold;
       if (sold >= limit) document.querySelector('.early-bird').classList.add('is-closed');
     });
   ```
5. Коли `sold >= limit` — JS автоматично:
   - Закреслює $29, показує $49 як основну ціну
   - Ховає блок Early Bird
   - Або показує "Sold out — Wave 2 starts soon"

**Чи це потрібно?**

✅ **Так**, після перших 10–20 продажів:
- Найсильніший social proof ("273 людини вже купили")
- Реальний urgency ("залишилось 727 місць")
- SEO-friendly (живий контент)
- Безкоштовно (один SQL count + кеш)

❌ **Поки не потрібно:**
- До деплою backend — нема чого рахувати
- Якщо ставити "fake counter" з рандомним числом — це обман і втрата довіри (стереже privacy-аудиторія, вони помітять)

**Альтернатива на launch (без бекенду):**
- Захардкодити "X з 1000" (наприклад "47 sold") і оновлювати руками раз на тиждень
- Або **взагалі не показувати число**, тільки текст "Limited to first 1 000 buyers" — менший support cost, чесно

- [ ] **Створити Edge Function `early-bird-count`** після деплою backend.
- [ ] **Додати компонент-лічильник** на `pages/pricing.html`.
- [ ] **Auto-switch ціни** $29 → $49 коли ліміт досягнуто (без ручного редагування HTML).
- [ ] **Notification email** автору, коли продано 50%, 80%, 100% — щоб встигнути оголосити Wave 2.
- [ ] **Не вмикати fake-counter** — privacy-аудиторія не пробачить.

---

## 12. Анти-фрод і ризики платежів (КРИТИЧНО)

- [ ] **Refund abuse:** користувач купує → активує → запитує refund → продовжує користуватись Pro у offline-режимі.
  - Mitigation: при refund webhook деактивувати ключ у БД, а застосунок при наступному online-чеку (раз на 14 днів) повертає в Free.
  - Реалізовано в архітектурі (поле `licenses.status`), але треба протестувати end-to-end.
- [ ] **Key sharing:** один ключ передається групі.
  - Mitigation: ліміт активацій 3 device-id на ключ (вже в `license_activations` table).
  - Доповнити: при перевищенні — webhook автору + email власнику ключа.
- [ ] **Card testing attack:** боти перевіряють краденi картки на checkout.
  - Mitigation: Paddle вже має внутрішню анти-фрод систему. Додатково — Cloudflare Turnstile перед checkout.
- [ ] **Webhook replay attack:** хтось перехоплює webhook payload і шле повторно.
  - Mitigation: вже є таблиця `webhook_events` з unique constraint на event_id (idempotency). Перевірити що Paddle event_id використовується.
- [ ] **License key brute-force через `validate` endpoint.**
  - Mitigation: rate limit 10 req/IP/min на цей endpoint + Turnstile після 3 невдалих спроб.
- [ ] **GDPR right to erasure:** покупець вимагає видалення даних.
  - Mitigation: створити процедуру: видалити email з `orders`, залишити тільки sha256(license_key) для аудиту.
  - Документувати в `pages/privacy.html` (зараз згадано загально).
- [ ] **Chargeback handling:** Paddle webhook `transaction.payment_failed` / `dispute_opened`.
  - Деактивувати ключ автоматично + email користувачу з поясненням.
- [ ] **Геообмеження:** деякі країни під санкціями не можуть купувати.
  - Paddle обробляє це сам. Перевірити що повідомлення для українських покупців нормальне.

---

## 13. Подальша монетизація (думати після перших 100 продажів)

- [ ] **Family plan** — 1 ключ → 5 пристроїв за $59 одноразово. Висока конверсія для домашніх користувачів.
- [ ] **Team / Business plan** — окремий продукт із централізованим управлінням ключами (поки тільки в roadmap features).
- [ ] **Lifetime updates upgrade** — після 12 міс оновлень користувач може заплатити $39 за довічні (замість $15/рік).
- [ ] **Sponsorship tier** — $99 "Founders Edition" з ім'ям в About + раннім доступом до фіч (для privacy-ентузіастів).
- [ ] **Self-hosted backend** для команд — окрема ліцензія $499/рік для тих, хто хоче свій Supabase з ліцензіями.
- [ ] **Code signing certificate як частина ціни** — користувачі готові доплатити, якщо це знімає Windows SmartScreen warning.

---

## 14. Реліз-план застосунку (важливо для сайту)

Сайт сильно залежить від готовності десктоп-застосунку. Перед launch треба:

- [ ] **Версіонування:** на сайті показувати **точну версію останнього релізу** (зараз `1.0` захардкоджено в JSON-LD).
  - Створити `assets/data/version.json` → читається на `pages/download.html` через JS.
  - GitHub Actions / release script оновлює цей файл при кожному релізі.
- [ ] **Реальні installers** замість `npm install` плейсхолдерів на `pages/download.html`.
  - Завантаження через CF R2 / GitHub Releases (хеш SHA256 поряд для перевірки)
  - SHA256 + signature можна перевіряти JS-функцією на сторінці перед скачуванням
- [ ] **Auto-update channel** — `https://vartovy.app/updates/latest.yml` (electron-updater формат).
- [ ] **Release notes сторінка** — `pages/changelog.html` з RSS-feed (`/changelog.rss`) для технічної аудиторії.
- [ ] **System requirements** на download.html: Windows 10 1809+, x64, 200 MB RAM, 100 MB disk.
- [ ] **Скріншоти різних флоу** в `pages/features.html` — після того як UI зафіналено.
- [ ] **Demo-відео** 30–60 сек на головній (self-hosted MP4, не YouTube — privacy).

---

## Пріоритезація

**P0 (must do до публічного launch):**
§1.1–§1.5 (платіжна інтеграція), §2.1–§2.2 (юридичне), §3.4–§3.5 (rate limit), §4.1, §4.4 (SEO + GSC), §12 (анти-фрод базові пункти), §14.2 (реальні installers)

**P1 (перші тижні після launch):**
§3.1, §3.6–§3.7 (CSP refinement, captcha), §4.2, §4.5 (a11y meta), §6.1 (Lighthouse), §8.5 (monitoring), §11 (Early Bird counter), §14.1, §14.3 (auto-update)

**P2 (перший місяць):**
§4.6 (changelog), §5.1–§5.4 (a11y), §7.4, §7.7 (newsletter, compare page), §8.3 (status page), §13 (додаткові плани)

**P3 (коли матиме сенс):**
§7.1–§7.3 (testimonials, logos), §9.1 (свої переклади замість Google Translate), §10.* (UX-плюшки активації)

---

*Створено: 30 квітня 2026. Оновлено: 30 квітня 2026 (додано §11–§14, аналіз Early Bird).*
*Оновлювати при кожному mini-релізі сайту.*
