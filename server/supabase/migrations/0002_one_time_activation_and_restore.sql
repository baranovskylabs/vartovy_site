-- =====================================================================
-- One-time activation key + restore by email OTP
-- =====================================================================

create table if not exists public.activation_keys (
    id                  uuid primary key default gen_random_uuid(),
    license_id          uuid        not null references public.licenses(id) on delete cascade,
    key_hash            text        not null unique,
    key_short           text        not null,
    status              text        not null default 'new', -- new | consumed | revoked
    consumed_at         timestamptz,
    consumed_device_id  text,
    created_at          timestamptz not null default now(),
    updated_at          timestamptz not null default now()
);

create index if not exists activation_keys_license_idx
    on public.activation_keys (license_id);

create index if not exists activation_keys_status_idx
    on public.activation_keys (status);

create table if not exists public.restore_challenges (
    id            uuid primary key default gen_random_uuid(),
    license_id    uuid        not null references public.licenses(id) on delete cascade,
    email         text        not null,
    device_id     text        not null,
    code_hash     text        not null,
    expires_at    timestamptz not null,
    attempts      integer     not null default 0,
    max_attempts  integer     not null default 5,
    used_at       timestamptz,
    created_at    timestamptz not null default now()
);

create index if not exists restore_challenges_lookup_idx
    on public.restore_challenges (email, device_id, created_at desc);

drop trigger if exists activation_keys_touch on public.activation_keys;
create trigger activation_keys_touch
before update on public.activation_keys
for each row execute function public.touch_updated_at();

alter table public.activation_keys    enable row level security;
alter table public.restore_challenges enable row level security;
