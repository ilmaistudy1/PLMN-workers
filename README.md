# PLMN Workers

PLMN Workers is an internal, authenticated Workers / Supporter Management CRM built with Next.js, Supabase Auth/PostgreSQL, and Row Level Security (RLS). It is designed for Vercel deployment and keeps member data private to authorized application users.

## Stack

- Next.js App Router + TypeScript
- React 19
- Tailwind CSS
- Supabase Auth + PostgreSQL + RLS
- `@supabase/ssr` for cookie-based SSR authentication
- npm
- Vercel

Use Node.js 22+ locally. The repository CI uses Node.js 24.

## Project structure

- `app/login` — email/password authentication
- `app/dashboard` — protected CRM workspace
- `app/dashboard/members` — member search, create, edit, archive/restore, and details
- `app/dashboard/areas` — hierarchical area management
- `app/dashboard/member-roles` — member classifications
- `app/dashboard/users` — application account administration
- `app/dashboard/audit` — operational audit log
- `app/api/members/search` — authenticated server-side search endpoint
- `lib/auth` — server authorization helpers
- `lib/supabase` — browser/server/proxy clients
- `supabase/migrations` — database schema, RLS, indexes, RPCs and hardening
- `supabase/seed.sql` — first-admin/setup notes
- `SECURITY.md` — security model and production checklist
- `PROJECT_STATUS.md` — final engineering handoff

## Environment variables

Copy `.env.example` to `.env.local`:

```env
NEXT_PUBLIC_SUPABASE_URL=https://your-project-ref.supabase.co
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=sb_publishable_your_key_here
```

These are the only application variables required. Never put a Supabase service-role or secret key in `NEXT_PUBLIC_*` variables or browser code.

## Local development

```bash
git clone <repository-url>
cd PLMN-workers
npm ci
cp .env.example .env.local
# edit .env.local
npm run dev
```

The application is then available at the local Next.js URL shown by the dev server.

## Supabase setup

The repository contains ordered SQL migrations under `supabase/migrations`.

For a fresh Supabase project:

```bash
supabase login
supabase link --project-ref <project-ref>
supabase db push
```

Then create the first trusted Auth user in Supabase Authentication and assign the `super_admin` application role. The exact SQL template is in `supabase/seed.sql`.

For the existing connected PLMN Supabase project, the schema was iterated through the Supabase management connection during development. Its remote migration history uses tool-generated migration versions rather than the repository filenames. Do not blindly replay the foundation migrations against that existing database; reconcile migration history first with `supabase migration list` / `supabase db pull`, then apply only migrations that are actually pending. The repository migration set is the source for fresh environments.

## First-admin setup

1. Create a trusted user in Supabase Authentication.
2. Copy the Auth user's UUID.
3. Insert that UUID into `public.user_roles` with the seeded `super_admin` role using the SQL template in `supabase/seed.sql`.
4. Sign in at `/login`.
5. Create the initial area hierarchy.
6. Create additional application accounts, assign roles, and assign authorized areas.

Do not use editable user metadata for authorization.

## Role model

Application login roles are separate from member classifications:

- `super_admin` — full application administration
- `admin` — subordinate account management plus authorized data/area administration
- `area_manager` — member management within assigned area scope
- `data_entry` — member creation/update within assigned area scope
- `viewer` — read-only member access within assigned area scope

Area assignments inherit to descendant areas. Higher-authority administrators cannot manage equal/higher-authority accounts, and users cannot manage their own application account through the admin controls.

## Security model

Authentication uses Supabase Auth. Server-rendered routes verify the current Auth user and active application profile. PostgreSQL RLS is the final authorization boundary.

All eight application tables are RLS-enabled:

- `profiles`
- `roles`
- `user_roles`
- `areas`
- `user_area_assignments`
- `member_roles`
- `members`
- `audit_logs`

The final hardening migration also removes unnecessary authenticated Data API table privileges and grants only the operations required by the application. Member search is performed by an authenticated RPC, and no member data is intentionally public or indexable.

Private dashboard/API responses use no-store/noindex headers. See `SECURITY.md` for the detailed threat model and production checklist.

## Useful commands

```bash
npm ci
npm run dev
npm run lint
npm run typecheck
npm run build
npm start
```

There is currently no separate test framework configured; the production verification pipeline is lint + TypeScript + Next.js production build, plus database/RLS verification.

## Vercel deployment

1. Import the GitHub repository into Vercel.
2. Use the repository root as the project root.
3. Add:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
4. Use the normal Next.js build command: `npm run build`.
5. Let Vercel install from the committed `package-lock.json`.
6. Deploy.
7. In Supabase Auth settings, configure the production Site URL and any required redirect URLs for the deployed domain.
8. Create/verify the first active `super_admin` before operational use.

No custom Vercel server, cron, secret proxy, or platform-specific infrastructure is required.

## Troubleshooting

### Dashboard redirects to login
Confirm the Auth session is valid, the `profiles` row exists, and `profiles.account_status = 'active'`. Check the browser network/cookies and the Supabase Auth configuration for the deployed origin.

### User can sign in but sees no members
Check their application role and `user_area_assignments`. Area permissions are enforced by database RLS, so an empty result can be correct for a user without scope.

### A member cannot be edited
Refresh the record first. The member may have moved outside the user's scope, the area may be inactive, or the record may be stale. Existing stale area/member-role references can be reviewed without bypassing RLS.

### Duplicate warning appears
Review the listed records. The application never auto-merges members. An authorized user must explicitly confirm saving a potential duplicate.

### Area cannot be deactivated
An area cannot be deactivated while it has active child areas or non-archived members. Move/archive those records first.

### Database permission errors after schema changes
Re-run the repository migrations against a fresh environment, or reconcile the existing environment's migration history before applying pending migrations. Also verify that RLS is enabled and the authenticated grants match the final hardening migration.

## Production checklist

- First trusted Auth user exists.
- At least one active `super_admin` exists.
- Initial area hierarchy and user assignments are reviewed.
- Production Site URL/redirects are configured in Supabase Auth.
- Vercel environment variables are set.
- `npm run lint`, `npm run typecheck`, and `npm run build` pass.
- No `.env.local`, Supabase secret/service-role key, database password, or Vercel token is committed.
- Read `PROJECT_STATUS.md` and `SECURITY.md` before handoff.


## Mobile offline app

The repository now includes an installable mobile PWA at `/mobile`. It is distributed by URL, so it does not require Google Play Store publication.

Mobile behavior:

- sign in online once;
- sync only the member/area/role data allowed by the authenticated user's RLS scope;
- search and view cached members offline;
- add, edit and archive members while offline;
- keep offline writes in an encrypted IndexedDB cache;
- automatically retry queued writes when connectivity returns;
- detect concurrent server edits and offer server-version or local-version resolution;
- clear the local offline database on sign out;
- periodically revalidate the application account when online.

For Android, share `https://plmn-workers.vercel.app/mobile` through WhatsApp, open it in Chrome, and use Chrome's install/Add to Home Screen option. The PWA shell and static assets are cached by `public/sw.js`; business data is stored locally in IndexedDB.
