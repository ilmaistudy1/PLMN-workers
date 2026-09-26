# Security

## Authorization model

PLMN Workers uses Supabase Auth for authentication and PostgreSQL Row Level Security (RLS) for authorization.

Application roles are stored in `public.roles` and assigned through `public.user_roles`. Member classifications in `public.member_roles` are separate and never grant application permissions.

- `super_admin`: full application administration.
- `admin`: manages subordinate accounts and data inside assigned scope.
- `area_manager`: manages members inside assigned areas.
- `data_entry`: adds/updates members inside assigned areas.
- `viewer`: read-only access inside assigned areas.

Role authority is rank-based. Administrators cannot manage an account whose highest active role is equal to or higher than their own authority, and users cannot assign roles to themselves.

Area scope is stored in `public.user_area_assignments`. Descendant areas inherit the assignment. Database policies enforce scope; hiding UI controls is not the security boundary.

Disabled application accounts are blocked by server authorization and database RLS. Disabling access does not delete the underlying Supabase Auth account.

## Authentication/session handling

- `@supabase/ssr` browser/server clients manage the Auth session in cookies.
- The root proxy refreshes the session with Supabase Auth claims.
- Protected dashboard routes require both an Auth user and an active application profile.
- A disabled account is sent back to login rather than being allowed into the dashboard.
- Insufficient-role dashboard routes return a non-descriptive not-found response.
- Logout uses the browser Supabase client and returns to `/login`.
- The login page does not expose raw Supabase authentication error text.

## Secrets and environment

The current application requires only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No service-role/secret key is required by the current application. Never place a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable or client component.

Repository hygiene excludes `.env.local` and other local-secret files through `.gitignore`.

## Data protection

Authenticated member records are protected by RLS and are not intended for public indexing. Private dashboard/API routes return noindex/no-follow/noarchive and no-store headers, and `app/robots.ts` disallows crawling of dashboard/API paths.

The application does not intentionally log passwords, tokens, phone numbers, addresses, or complete member records. Audit metadata is limited to operational fields such as action, entity, role/area identifiers and account-status changes.

Member phone/address values are not placed in URLs. Record pages use opaque UUID identifiers.

## Database/RLS controls

All eight application tables are RLS-enabled.

The final hardening grants are least-privilege for the application Data API:

- `profiles`: SELECT plus UPDATE of `full_name` and `account_status`
- `roles`: SELECT
- `user_roles`: SELECT/INSERT/DELETE
- `user_area_assignments`: SELECT/INSERT/DELETE
- `areas`: SELECT/INSERT/UPDATE
- `member_roles`: SELECT/INSERT/UPDATE
- `members`: SELECT/INSERT/UPDATE
- `audit_logs`: SELECT

RLS policies additionally restrict rows and mutation conditions. There is no anonymous table access.

Member updates use both old-row authorization and new-row `WITH CHECK` rules. Existing stale member-role references may remain editable, while assigning a new inactive member role is blocked.

Area creation/moves cannot create active child areas beneath inactive parents.

Administrative application-role replacement is done through an atomic `SECURITY INVOKER` database function with server-side authority checks.

## Audit logging

Audit triggers capture operational changes such as:

- member create/update/delete
- member area/role changes
- area changes
- member-role changes
- user application-role changes
- user area-assignment changes
- account status changes

Audit readers are scope-restricted. Sensitive fields such as passwords, tokens, phone numbers, addresses, and full member payloads are not intentionally logged.

## Dependency/build security

- Node.js 22+ is the local minimum; CI uses Node.js 24.
- `package-lock.json` is committed and CI uses `npm ci`.
- Do not add service-role/secret dependencies unless the security model is reviewed first.
- Keep dependency upgrades deliberate and verify lint/typecheck/build after upgrades.

## Production checklist

Before public deployment:

- keep environment variables in Vercel, not Git;
- serve over HTTPS;
- configure Supabase Auth Site URL/redirect URLs;
- verify at least one active `super_admin`;
- verify initial user-area assignments;
- verify application roles are active and correctly assigned;
- verify no secrets are committed;
- review the latest `PROJECT_STATUS.md`;
- keep dependency lockfiles and update dependencies through reviewed changes.


## Mobile/offline controls

The mobile client uses the same Supabase authentication and PostgreSQL RLS boundary as the web application. It downloads only records the current account can read.

Offline data is stored in IndexedDB as an AES-GCM encrypted state blob. The encryption key is kept by the browser's origin storage; this protects the stored representation from casual inspection but is not a substitute for full-device encryption or a hardened mobile container.

Offline writes are queued locally and replayed against Supabase when connectivity returns. Updates use the previously synced `updated_at` value as an optimistic-concurrency check. Conflicts are surfaced to the user rather than silently overwriting a newer server record.

The mobile cache is cleared when the user signs out. When online, the mobile sync checks the current application profile status and clears the cache if the account is disabled.


## Phone authentication

Phone login uses a Supabase-managed SMS OTP. The login form does not create accounts; the user's phone must already belong to an authorized Supabase Auth account. The application mirrors the verified Auth phone into `public.profiles.phone` for authorized user-management views. Email is nullable and optional.

Do not collect or expose phone numbers outside the application's legitimate account-management purpose. SMS OTP delivery should be protected with Supabase rate limits and CAPTCHA according to the project's production Auth configuration.


## Required phone number

The application continues to authenticate with Supabase email/password. A phone number is required as an application profile field, but no SMS/OTP provider is used.

Users without a phone number are redirected to the authenticated `/setup/phone` page before role-protected application access. The phone is stored in `public.profiles.phone`, normalized to international format, validated by a database constraint, and included in authorized administrator views.

Phone numbers are not used as a login identifier and are not placed in public URLs or audit payloads.
