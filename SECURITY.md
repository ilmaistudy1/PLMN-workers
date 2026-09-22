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

## Secrets and environment

The current application requires only:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No service-role/secret key is required by the current application. Never place a Supabase secret/service-role key in a `NEXT_PUBLIC_*` variable or client component.

## Data protection

Authenticated member records are protected by RLS and are not intended for public indexing. Private dashboard/API routes return noindex/no-follow metadata and robots rules disallow crawling.

The application does not intentionally log passwords, tokens, phone numbers, addresses, or complete member records. Audit metadata is limited to operational fields such as action, entity, role/area identifiers and account-status changes.

## Administrative controls

User role replacement is performed through an atomic database function with server-side and RLS authorization checks. Area assignment mutations are RLS-protected. Application-account disable/restore uses `profiles.account_status`; the Auth identity remains intact.

Audit logs are append-only from the application UI and restricted by administrative scope.

## Production checklist

Before public deployment:

- keep environment variables in the hosting platform;
- serve over HTTPS;
- verify Supabase Auth redirect/session settings;
- verify at least one active `super_admin` exists;
- verify user-area assignments;
- review the latest `PROJECT_STATUS.md`;
- keep dependency lockfiles and update dependencies through reviewed changes.
