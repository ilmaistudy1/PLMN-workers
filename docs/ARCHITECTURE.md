# Architecture

## Application

- Next.js App Router + TypeScript
- React + Tailwind CSS
- Supabase Auth/PostgreSQL
- `@supabase/ssr` browser/server clients
- Root proxy for cookie-based Auth session refresh
- Vercel-compatible Next.js deployment

Browser code uses only the Supabase project URL and publishable key. No service-role or Supabase secret key is required by the application.

## Authentication

The login page uses email/password Supabase Auth. The server resolves the authenticated user and then requires an active row in `public.profiles`.

Protected dashboard routes are checked in the dashboard layout and server-side actions. Disabled application accounts are treated as unauthenticated for application access.

## Authorization

Application roles are stored in `public.user_roles` and `public.roles`. Member classifications are stored independently in `public.member_roles`.

Authorization is enforced twice:

1. Next.js server authorization determines which pages/actions can execute.
2. PostgreSQL RLS enforces row-level access for every exposed application table.

Area scope is hierarchical. An assignment to an area includes its active descendants for normal access; controlled in-scope checks also allow safe handling of existing stale/inactive records.

## Data model

The application tables are:

- `profiles`
- `roles`
- `user_roles`
- `areas`
- `user_area_assignments`
- `member_roles`
- `members`
- `audit_logs`

Members retain original phone/address input. Generated normalized phone fields support duplicate detection and search without changing source values.

## Search/dashboard

Member search is performed by an authenticated PostgreSQL RPC with pagination and filters. The client debounces interactive searches, cancels stale requests, and never fetches the full member dataset.

The dashboard uses a single statistics RPC plus limited recent activity/member queries. It does not load the complete members table.

## Audit

Database triggers record operational changes. Audit visibility is itself protected by RLS and administrative scope. Sensitive secrets and unnecessary member private data are excluded from audit metadata.

## Deployment

The repository contains ordered Supabase migrations and a committed npm lockfile. Vercel only needs the two public Supabase environment variables. No custom server infrastructure is required.
