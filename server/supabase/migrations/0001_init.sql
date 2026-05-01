-- =====================================================================
-- Vartovy — схема для системи Pro-ліцензій
-- Інтеграція: Lemon Squeezy License Keys + Supabase Postgres
-- =====================================================================

create extension if not exists "pgcrypto";

-- ---------------------------------------------------------------------
-- Таблиця замовлень. Дзеркалить події Lemon Squeezy (order_created).
-- ---------------------------------------------------------------------
create table if not exists public.orders (
    id              uuid primary key default gen_random_uuid(),
    ls_order_id     bigint        not null unique,        -- Lemon Squeezy order id
    ls_store_id     bigint        not null,
    ls_product_id   bigint,
    ls_variant_id   bigint,
    customer_email  text          not null,
    customer_name   text,
    total_cents     integer       not null,
    currency        text          not null default 'USD',
    status          text          not null,               -- paid | refunded | ...
    raw             jsonb         not null,               -- повний payload вебхука
    created_at      timestamptz   not null default now()
);

create index if not exists orders_email_idx on public.orders (customer_email);

-- ---------------------------------------------------------------------
-- Ліцензії. Один order може мати кілька ключів (qty > 1).
-- Ключ генерується Lemon Squeezy; ми лише зберігаємо метадані та
-- керуємо активаціями/ревокацією.
-- ---------------------------------------------------------------------
create table if not exists public.licenses (
    id                 uuid primary key default gen_random_uuid(),
    order_id           uuid          not null references public.orders(id) on delete cascade,
    ls_license_key_id  bigint        not null unique,     -- id у Lemon Squeezy
    key_short          text          not null,            -- останні 4 символи (для пошуку у листі)
    key_hash           text          not null unique,     -- sha256(full_key) — повний ключ НЕ зберігаємо
    customer_email     text          not null,
    plan               text          not null default 'pro',
    status             text          not null default 'active', -- active | revoked | refunded | expired
    activation_limit   integer       not null default 3,  -- скільки пристроїв дозволено
    activations_count  integer       not null default 0,
    expires_at         timestamptz,                       -- null = довічна
    created_at         timestamptz   not null default now(),
    updated_at         timestamptz   not null default now()
);

create index if not exists licenses_email_idx on public.licenses (customer_email);
create index if not exists licenses_status_idx on public.licenses (status);

-- ---------------------------------------------------------------------
-- Активації пристроїв.
-- ---------------------------------------------------------------------
create table if not exists public.license_activations (
    id              uuid primary key default gen_random_uuid(),
    license_id      uuid          not null references public.licenses(id) on delete cascade,
    device_id       text          not null,               -- стабільний fingerprint від десктоп-клієнта
    device_name     text,
    platform        text,                                  -- windows / macos / linux
    ip_hash         text,                                  -- sha256(ip + salt)
    last_seen_at    timestamptz   not null default now(),
    created_at      timestamptz   not null default now(),
    revoked_at      timestamptz,
    unique (license_id, device_id)
);

create index if not exists activations_license_idx on public.license_activations (license_id);

-- ---------------------------------------------------------------------
-- Лог подій вебхуків (для аудиту і ідемпотентності).
-- ---------------------------------------------------------------------
create table if not exists public.webhook_events (
    id           uuid primary key default gen_random_uuid(),
    provider     text          not null default 'lemonsqueezy',
    event_name   text          not null,
    event_id     text          not null,                   -- X-Event-Id
    payload      jsonb         not null,
    received_at  timestamptz   not null default now(),
    unique (provider, event_id)
);

-- ---------------------------------------------------------------------
-- Тригер для updated_at
-- ---------------------------------------------------------------------
create or replace function public.touch_updated_at()
returns trigger language plpgsql as $$
begin
    new.updated_at = now();
    return new;
end;
$$;

drop trigger if exists licenses_touch on public.licenses;
create trigger licenses_touch before update on public.licenses
    for each row execute function public.touch_updated_at();

-- ---------------------------------------------------------------------
-- RLS: усе закрито. Edge Functions працюють під service_role і
-- обходять RLS. Анонімний клієнт не має доступу до цих таблиць.
-- ---------------------------------------------------------------------
alter table public.orders               enable row level security;
alter table public.licenses             enable row level security;
alter table public.license_activations  enable row level security;
alter table public.webhook_events       enable row level security;
