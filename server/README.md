# Vartovy Pro — система ліцензування

Бекенд для видачі та перевірки Pro-ліцензій. Стек:

- **Lemon Squeezy** → платежі + автоматична генерація і відправка ключа покупцю
  (вбудована фіча *License Keys*).
- **Supabase Postgres** → дзеркало замовлень/ліцензій, облік активацій.
- **Supabase Edge Functions (Deno)** → вебхук Lemon Squeezy + ендпоінти
  активації/перевірки/деактивації.
- **Ed25519** → короткоживучі офлайн-токени, які десктоп перевіряє без мережі.

---

## Як це працює

```
   Покупець                Lemon Squeezy              Supabase                  Десктоп
─────────────         ────────────────────       ─────────────────         ────────────────
1. Натискає "Buy Pro" ─► Checkout                                          
2. Платить                ✓ платіж пройшов                                 
3.                        генерує License Key                              
                          надсилає лист з ключем  ──► (покупець бачить ключ)
                          ↓ webhook order_created
                          ↓ webhook license_key_created
                                                  → orders, licenses (key_hash)
4.                                                                         Юзер вводить ключ
5.                                                                         POST /activate
                                                  → перевіряє key_hash
                                                  → Lemon /licenses/activate
                                                  → license_activations
                                                  ◄── offline_token (Ed25519, 14 днів)
6.                                                                         Працює офлайн
                                                                           (перевіряє підпис)
7.                                                                         Раз на 24г → /validate
                                                  ◄── valid: true|false
```

Повний ключ **не зберігається** у нашій БД — тільки `sha256(key)`. Якщо БД
буде скомпрометовано, ключі покупців не витечуть.

---

## Налаштування

### 1. Lemon Squeezy

1. Створи Store → Product (тип **Single Payment**).
2. У продукті → вкладка **License Keys** → ✅ *Generate license keys*.
   - Activation limit: **3** (або скільки треба).
   - Expires: *Never* (для довічної ліцензії).
3. Налаштуй **Email template** для замовлення — Lemon Squeezy автоматично
   вставить блок зі згенерованим ключем у лист `Order Confirmation`.
4. **Settings → Webhooks** → New webhook:
   - URL: `https://<твій-проект>.supabase.co/functions/v1/lemon-webhook`
   - Signing secret: згенеруй випадковий рядок → збережи як
     `LEMONSQUEEZY_WEBHOOK_SECRET`.
   - Події: ✅ `order_created`, ✅ `order_refunded`,
     ✅ `license_key_created`, ✅ `license_key_updated`.
5. **Settings → API** → створи API Key → це `LEMONSQUEEZY_API_KEY`.

### 2. Supabase

```bash
# 1. Встанови CLI: https://supabase.com/docs/guides/cli
supabase login
supabase link --project-ref <project-ref>

# 2. Накотити схему
supabase db push
# (або: supabase migration up)

# 3. Згенерувати Ed25519 пару
deno run --allow-write server/scripts/generate-signing-keys.ts
# → скопіюй private_key_b64url у секрети, public_key_b64url зашив у десктоп

# 4. Задати секрети
supabase secrets set \
  LEMONSQUEEZY_API_KEY=... \
  LEMONSQUEEZY_WEBHOOK_SECRET=... \
  LICENSE_SIGNING_PRIVATE_KEY=... \
  IP_HASH_SALT=... \
  ALLOWED_ORIGINS=https://vartovy.app

# 5. Задеплоїти функції
supabase functions deploy lemon-webhook --no-verify-jwt
supabase functions deploy activate
supabase functions deploy validate
supabase functions deploy deactivate
```

> `--no-verify-jwt` для `lemon-webhook` обов'язково — Lemon Squeezy не
> надсилає JWT, ми перевіряємо власноруч HMAC через `X-Signature`.

### 3. Сайт

У `assets/js/activate.js` заміни `SUPABASE_URL` і `SUPABASE_ANON_KEY` на
свої. Сторінка `pages/activate.html` дає покупцю UI, щоб перевірити свій
ключ онлайн (та для троблшутингу). На `pages/pricing.html` додано кнопку
*Buy Pro* з overlay-чекаутом Lemon Squeezy — заміни `LS_PRODUCT_URL` на
URL свого продукту.

### 4. Десктоп-клієнт (інтеграція)

```ts
// 1. При першому запуску в "Pro mode":
const r = await fetch("https://<proj>.supabase.co/functions/v1/activate", {
  method: "POST",
  headers: { "content-type": "application/json" },
  body: JSON.stringify({
    license_key: userInput,
    device_id:   stableMachineId(),  // напр. hash(machine-guid + os-install-id)
    device_name: os.hostname(),
    platform:    process.platform,
  }),
});
const { offline_token } = await r.json();
// зберегти offline_token у безпечному сховищі (DPAPI на Windows).

// 2. Офлайн при кожному старті:
verifyEd25519(token, EMBEDDED_PUBLIC_KEY);  // тільки локальна криптоперевірка
// Якщо token.exp < now → спробувати POST /validate, інакше fallback Free.

// 3. Раз на 24г, якщо є інтернет:
//    POST /validate → якщо { valid: false } → перевести у Free та запросити перевхід.
```

---

## Чому така архітектура

| Альтернатива                                | Чому **не** обрано                         |
|---------------------------------------------|--------------------------------------------|
| Своя генерація ключів + свій SMTP            | Дублювання роботи Lemon Squeezy + ризик у delivery листів |
| Виключно онлайн-перевірка                   | Vartovy = офлайн-сейф; жорсткий онлайн-чек ламає UX |
| Виключно офлайн (підписаний "ключ у файлі") | Немає можливості revoke при refund / chargeback |
| **Гібрид (тут)**                            | Юзер працює офлайн з підписаним токеном, ми зберігаємо контроль через короткий TTL і `/validate` |

---

## Безпека

- HMAC-SHA256 перевірка вебхуків (timing-safe порівняння).
- Повний ключ ніколи не залишає нас у відкритому вигляді — у БД лише
  `sha256(key)`.
- Service role ключ Supabase існує тільки в env Edge Function.
- RLS увімкнено на всіх таблицях; анонімний доступ заблоковано.
- Офлайн-токен короткий (14 днів) → revoke поширюється не пізніше ніж
  через 14 днів навіть якщо клієнт повністю офлайн.
- IP логуються тільки як `sha256(salt + ip)`.

---

## Локальна розробка

```bash
cd server
supabase start                              # підняти локальний Postgres
supabase functions serve lemon-webhook --no-verify-jwt --env-file .env
# другий термінал:
supabase functions serve activate --env-file .env
```

Тестовий вебхук від Lemon Squeezy:
**Settings → Webhooks → ⋯ → Send test event**.
