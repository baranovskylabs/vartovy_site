# Vartovy Activation Scheme (One-Time Key)

## Goal
- User buys license once.
- User receives receipt + one-time activation key by email.
- User activates Vartovy by entering the key once.
- License is bound to the device and works long-term on that device.
- The activation key becomes invalid immediately after successful activation.
- After OS reinstall, restore is done via email OTP for the same device ID.

## Database entities
- `orders` - payment mirror from provider webhooks.
- `licenses` - paid entitlement (`status`, `plan`, `activation_limit`, `expires_at`).
- `activation_keys` - one-time keys (`new` -> `consumed` -> `revoked`).
- `license_activations` - device binding (`license_id`, `device_id`).
- `restore_challenges` - short-lived OTP challenges for reinstall recovery.

## Flow
1. Payment webhook (`lemon-webhook`) stores `order` and `license`.
2. Backend generates one-time key (`VRTV-XXXX-XXXX-XXXX`), stores only SHA-256 hash in `activation_keys`.
3. Backend sends key to user email (Resend).
4. Desktop calls `POST /functions/v1/activate` with `activation_key` + `device_id`.
5. Backend checks license state and activation limits, atomically consumes key, binds device, returns signed Ed25519 device token.
6. Desktop stores token locally and unlocks paid tier.
7. On Windows reinstall, desktop calls:
   - `POST /functions/v1/restore-request` (`email`, `device_id`) -> OTP to email
   - `POST /functions/v1/restore-confirm` (`email`, `device_id`, `code`) -> new signed device token

## Security rules
- Never store plain activation key in DB.
- Activation key is one-time and cannot be reused.
- Restore code is short-lived (10 min) and attempt-limited.
- All license tables are RLS-enabled and accessed only from service role in Edge Functions.
- Device token is Ed25519 signed and verified offline in desktop app.

## Required secrets
- `SUPABASE_URL`
- `SUPABASE_SERVICE_ROLE_KEY`
- `LICENSE_SIGNING_PRIVATE_KEY`
- `LEMONSQUEEZY_WEBHOOK_SECRET`
- `RESTORE_CODE_SALT`
- `RESEND_API_KEY`
- `RESEND_FROM_EMAIL`
- `IP_HASH_SALT`

## Endpoints
- `POST /functions/v1/lemon-webhook`
- `POST /functions/v1/activate`
- `POST /functions/v1/restore-request`
- `POST /functions/v1/restore-confirm`
- `POST /functions/v1/validate` (optional heartbeat)
- `POST /functions/v1/deactivate` (admin/support use)

## Notes for future updates
- If moving from Lemon Squeezy to Paddle, keep the same DB and activation flow; only webhook adapter changes.
- If you need hard "single-device forever", set `activation_limit = 1` for the license plan.
