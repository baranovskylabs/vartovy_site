# Vartovy — Website

Маркетинговий і документальний сайт продукту **Vartovy** — offline-first desktop-сейфа для Windows.

Сайт — статичний (без збірки): чистий HTML + CSS + ванільний JS. Це відповідає духу основного продукту (privacy-first, мінімум залежностей, працює оффлайн).

## Структура

```
Vartovy site/
├── index.html              # Головна (hero, features, how-it-works, CTA)
├── pages/
│   ├── features.html       # Деталі можливостей + roadmap
│   ├── security.html       # Криптографія, threat model, межі довіри
│   ├── pricing.html        # 4 плани, comparison table, FAQ
│   ├── download.html       # Системні вимоги, build from source
│   ├── privacy.html        # Privacy Policy (UA)
│   └── terms.html          # Terms of Use (UA)
├── assets/
│   ├── css/styles.css      # Дизайн-система (dark + light)
│   ├── js/main.js          # Theme toggle, mobile nav, active link, year
│   └── img/                # logo.png, favicon.ico
└── README.md
```

## Локальний запуск

Будь-який статичний сервер. Наприклад:

```powershell
# З папки сайту
npx serve .
# або
python -m http.server 5173
```

Потім відкрийте http://localhost:5173

## Особливості реалізації

- **Темна / світла тема** — перемикач у шапці, налаштування зберігається в `localStorage`.
- **Адаптивність** — мобільне меню, breakpoints на 960px і 640px.
- **Доступність** — `prefers-reduced-motion`, семантичні теги, контраст кольорів.
- **SEO/OG** — title, description, OpenGraph для головної.
- **Без зовнішніх CDN/шрифтів** — використано системний шрифт-стек, нічого не вантажиться з мережі.

## Зв'язок з основним додатком

Контент сайту базується на документах `Vartovy/docs/`:
- `APP_IDEA.md` → Hero, Features, How it works
- `PRODUCT_VISION.md` → Security model, принципи
- `PRICING_AND_PLANS.md` → Pricing page (Free / Pro / Lifetime / Team) + FAQ
- `THREAT_MODEL.md` → Security page (від чого захищаємо / поза межами)
- `PRIVACY_POLICY.md` → pages/privacy.html
- `TERMS_OF_USE.md` → pages/terms.html

Логотип і фавікон скопійовані з `Vartovy/assets/icons/`.

## Що залишилось доробити перед публічним запуском

- Замінити плейсхолдери юридичної особи (`[Company Legal Name]`, адреса, дата) у privacy/terms.
- Замінити email домени `*@vartovy.example` на реальні.
- Додати реальні посилання на інсталятор у `pages/download.html`.
- Скріншоти/скрінкаст застосунку для секції features.
- (Опційно) blog/changelog розділ.
