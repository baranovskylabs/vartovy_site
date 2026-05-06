# Vartovy — Deployment Guide

Покрокова інструкція запуску `vartovy.app` від придбаного домена до публічного сайту з власною поштою.

---

## 1. Огляд стека

| Шар               | Сервіс                           | Вартість       |
|-------------------|----------------------------------|----------------|
| Домен             | GoDaddy → DNS на Cloudflare      | вже куплено    |
| Hosting           | Cloudflare Pages                 | $0             |
| Email forwarding  | Cloudflare Email Routing         | $0             |
| Email mailbox     | ProtonMail (mail.proton.me)      | $0 (Free) або платний |
| SSL               | Cloudflare (автоматично)         | $0             |
| Платежі           | Paddle (Merchant of Record)      | 5% + $0.50/tx  |
| Backend (license) | Supabase (Postgres + Edge Func)  | $0 (Free tier) |

---

## 2. Cloudflare Pages — публікація сайту

### 2.1. Підготовка
1. Завести акаунт на https://dash.cloudflare.com
2. Створити Git-репозиторій (GitHub/GitLab/Bitbucket) і запушити цю папку (`Vartovy site`).
3. Не комітити `server/.env`, `server/keys/` — переконайтесь що `.gitignore` їх ігнорує.

### 2.2. Створити Pages-проєкт
1. Cloudflare Dashboard → **Workers & Pages** → **Create application** → **Pages** → **Connect to Git**.
2. Виберіть свій репозиторій.
3. Build settings:
   - **Framework preset**: `None`
   - **Build command**: *(порожньо)*
   - **Build output directory**: `/` (корінь репозиторію)
4. Натисніть **Save and Deploy**. За хвилину сайт буде доступний на `https://<projectname>.pages.dev`.

### 2.3. Підключити власний домен
1. Pages → ваш проєкт → **Custom domains** → **Set up a custom domain** → ввести `vartovy.app`.
2. Cloudflare запропонує два варіанти:
   - Якщо домен ще не на CF DNS — увімкнути CF DNS (потрібно змінити nameservers у GoDaddy, див. пункт 3).
   - Якщо вже на CF DNS — створить CNAME автоматично.
3. Додати `www.vartovy.app` як другий custom domain з redirect-ом на apex.

### 2.4. Файли конфігурації (вже у репо)
- `_headers` — security headers (HSTS, X-Frame-Options, CSP-friendly) + force-download для `/downloads/*.exe`.
- `_redirects` — короткі URL aliases (`/pricing`, `/versions`, `/latest` → останній .exe) і legacy-редірект `#contact`.
- `404.html` — кастомна сторінка помилки.
- `sitemap.xml`, `robots.txt` — для пошукових систем.

### 2.5. Білди застосунку (`/downloads/`)

| Файл | Розмір | Чим є |
|------|--------|-------|
| `downloads/Vartovy-1.0.0-x64-Portable.exe` | 95.3 MB | Перший публічний реліз |
| `downloads/releases.json` | < 1 KB | Маніфест версій (читається з `/pages/versions.html`) |
| `downloads/README.md` | — | Інструкція як додавати нові версії |

> **Важливо.** Cloudflare Pages обмежує одиничний файл у репо до **25 MB**.
> 95-мегабайтний `.exe` потрібно віддавати інакше. Два надійні варіанти:
>
> 1. **GitHub Releases** — створити реліз `v1.0.0`, прикріпити `.exe`, потім у
>    `downloads/releases.json` поміняти `url` на `https://github.com/<user>/<repo>/releases/download/v1.0.0/Vartovy-1.0.0-x64-Portable.exe`.
>    `_redirects` додатково віддасть `/latest` як 302.
> 2. **Cloudflare R2** — створити bucket `vartovy-builds`, увімкнути public access або
>    повісити Worker `https://dl.vartovy.app/*`, скласти `.exe` туди, оновити `url` у
>    маніфесті. Дешево і без лімітів.
>
> Локально файл лежить у `downloads/` для зручності розробки і тестового пуша
> в репо, який підтримує LFS / великі файли. Перед першим деплоєм на CF Pages
> або винесіть його у GitHub Release / R2, або додайте до `.gitignore` і
> залийте на CF R2 окремо.

---

## 3. GoDaddy → Cloudflare DNS

> Cloudflare безкоштовний для DNS і дає Pages, Email Routing, кешування, аналітику.

1. У Cloudflare: **Add a Site** → ввести `vartovy.app` → план **Free** → **Continue**.
2. Cloudflare покаже **2 nameservers** (наприклад `ada.ns.cloudflare.com`, `bob.ns.cloudflare.com`).
3. У GoDaddy: **My Products** → `vartovy.app` → **DNS** → **Nameservers** → **Change** → **Enter my own nameservers** → вставити обидва значення з CF → **Save**.
4. Поширення триває 5 хв – 24 год. Перевірити: `nslookup -type=ns vartovy.app`.
5. Після того як CF побачить свої nameservers, він автоматично активує SSL і опублікує DNS-зону.

---

## 4. Email — `support@vartovy.app`

### 4.1. Cloudflare Email Routing (forwarding)
1. У Cloudflare → ваш домен → **Email** → **Email Routing** → **Get started**.
2. CF додасть необхідні MX і TXT-записи автоматично (підтвердити).
3. Додати destination address: вашу персональну ProtonMail-адресу → підтвердити в email.
4. Створити правило: `support@vartovy.app` → forward to `<your>@protonmail.com`.
5. (Опційно) додати catch-all: `*@vartovy.app` → той самий ящик.

### 4.2. Можливість надсилати з домену (опційно)
CF Email Routing **тільки приймає і пересилає**. Щоб слати листи від імені `support@vartovy.app`:
- Або підключити поштовий хостинг (ProtonMail Bridge ($), Zoho Mail Free, Mailgun, Resend).
- Або тимчасово відповідати з власного ProtonMail з підписом "Vartovy Support — support@vartovy.app".

Рекомендація на старті: відповідати з ProtonMail. Після першого Pro-замовлення — підняти Resend ($0 до 3 000 листів/міс) для transactional email (доставка ключа активації).

---

## 5. Open Graph image

Зараз у репо лежить `assets/img/og-image.svg`. Соціальні мережі краще приймають PNG.

```powershell
# З-під Node 18+ (Windows / macOS / Linux):
npm install -g svgexport
svgexport assets\img\og-image.svg assets\img\og-image.png 1200:630
```

Або онлайн: https://cloudconvert.com/svg-to-png (виставити 1200×630).

Покласти результат поряд (`assets/img/og-image.png`) і запушити — всі мета-теги вже посилаються на цей файл.

---

## 6. Paddle — інтеграція платежів (TODO після верифікації акаунту)

Поточний backend (`server/`) написано під Lemon Squeezy, але архітектура провайдер-агностична: треба переписати лише `server/supabase/functions/_shared/lemon.ts` → `paddle.ts` і `lemon-webhook/index.ts` → обробник Paddle webhook events:

- `transaction.completed` → видати ліцензію (як зараз `order_created`)
- `subscription.canceled` / `subscription.past_due` → деактивувати
- Підпис: HMAC-SHA256 з `PADDLE_NOTIFICATION_KEY` (заголовок `Paddle-Signature`)

**Перед інтеграцією**: дочекатись KYB-верифікації Paddle (надіслали бізнес-документи), створити Product у Paddle Dashboard, отримати `price_id` і вставити в `pages/pricing.html` замість Lemon-overlay-URL.

Альтернативи якщо Paddle відмовить: **Polar.sh** (підтримує Україну, дешевше — 4%), **Gumroad** (10%, але універсально).

---

## 7. Cloudflare KV — rate limit для форми зворотного зв'язку

Форма (`/pages/contact.html`) тепер надсилає POST на Cloudflare Pages Function
`/api/contact` замість прямого FormSubmit. Function перевіряє ліміт 3 повідомлення
на IP на добу через KV-сховище.

### Налаштування KV namespace
1. Cloudflare Dashboard → **Workers & Pages** → **KV** → **Create namespace** → ім'я `CONTACT_RATE` → **Add**.
2. У проєкті Pages → **Settings** → **Functions** → **KV namespace bindings** → **Add binding**:
   - Variable name: `CONTACT_RATE`
   - KV namespace: виберіть щойно створений `CONTACT_RATE`
3. Зберегти і зробити новий деплой (push до репо).

> Без прив'язки KV namespace функція все одно працює, але rate limit по IP
> **не застосовується** (пропускається). Тобто форма буде доступна, але не обмежена.

---

## 8. Чек-лист перед публічним анонсом

- [ ] Cloudflare Pages зібрано без помилок.
- [ ] DNS `vartovy.app` і `www.vartovy.app` відповідає `pages.dev` CNAME.
- [ ] HTTPS активний, redirect HTTP → HTTPS у CF.
- [ ] Email forwarding `support@` → особистий ящик працює (тестовий лист дійшов).
- [ ] OG-image видно у https://www.opengraph.xyz/url/vartovy.app
- [ ] Sitemap доступний за `https://vartovy.app/sitemap.xml`.
- [ ] У Google Search Console додано domain property та підтверджено DNS-record.
- [ ] У `pages/privacy.html` і `pages/terms.html` ФОП-дані вписані (зараз TODO-коментар).
- [ ] Paddle інтегровано і кнопки в `pages/pricing.html` ведуть на реальний checkout.
- [ ] Сертифікат коду застосунку (Code Signing) куплено для Windows installer (наступний етап).

---

## 8. Наступні етапи

1. **Desktop installer** — Electron Builder + NSIS/MSIX, sign-tool, automatic updates через `electron-updater`.
2. **License delivery** — після `transaction.completed` у Paddle webhook автоматично слати email з ключем активації (HTML-шаблон).
3. **Crash reporter** — Sentry або self-hosted GlitchTip (мінімальний privacy-impact).
