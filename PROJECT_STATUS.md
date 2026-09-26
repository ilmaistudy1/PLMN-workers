# Project Status

## Stage
Prompt 5 — Final QA, Hardening & Vercel Deployment Readiness

## Final completion state
The repository is in final production-handoff shape for a fresh Supabase environment and Vercel deployment. Working functionality from Prompts 1–4 was preserved; Prompt 5 focused on QA, authorization hardening, reliability, least-privilege grants, deployment determinism, documentation, and final verification.

## Implemented application features

### Authentication
- Email/password Supabase Auth login and logout.
- Cookie-based SSR session handling with `@supabase/ssr`.
- Root session-refresh proxy.
- Dashboard requires both a valid Auth user and an active `public.profiles` application account.
- Disabled application accounts are redirected back to login.
- Protected routes fail closed without exposing database or authorization internals.
- Login does not expose raw provider error text.

### Member management
- Paginated server-side member search with text, status, role and hierarchical area filters.
- Debounced search with keyboard navigation and highlighting.
- Request cancellation prevents stale search responses from overwriting newer results.
- Member create/edit/view workflow.
- Duplicate detection with explicit confirmation; no automatic merging.
- Active/inactive/archive/restore lifecycle.
- Phone validation and normalized duplicate/search helpers.
- Area/member-role reference validation.
- Existing stale area/member-role references remain reviewable without allowing unauthorized scope changes.
- Member private fields are never placed in URLs.

### Area and member-role management
- Parent/child area hierarchy.
- Cycle protection.
- Area create/edit/deactivate/reactivate controls.
- Areas cannot be deactivated while active children or non-archived members still reference them.
- Active child areas cannot be created or moved beneath inactive parents.
- Member-role classification management is separate from application login roles.

### User administration
- Admin-only Users section.
- Account name/email, active application role, assigned areas, status and timestamps.
- Atomic application-role replacement through a database-authorized function.
- Authority hierarchy prevents equal/higher-role management by lower administrators.
- Self role/status changes are blocked.
- Area assignment add/remove is RLS-protected.
- At least one active super-admin is preserved when disabling accounts.

### Audit
- Operational audit logging for member, area, member-role, user-role, area-assignment and account-status changes.
- Administrative audit page with actor/action/entity/date filters.
- Audit visibility is scope-restricted.
- Sensitive fields such as passwords, tokens, phones and addresses are not intentionally logged.

### Dashboard and UX
- Member/area/role summaries and recent activity.
- Quick actions and recent members.
- Loading, empty, no-results, retry/error and confirmation states.
- Responsive navigation and mobile-friendly tables/forms.
- Private dashboard/API routes use no-store/noindex headers.
- Robots rules disallow private dashboard/API crawling.

## Database tables

The application uses eight public tables, all with RLS enabled:

1. `profiles`
2. `roles`
3. `user_roles`
4. `user_area_assignments`
5. `areas`
6. `member_roles`
7. `members`
8. `audit_logs`

The connected PLMN Supabase project currently has zero application users and zero member rows. No fake people, phone numbers or production records were created.

## Authorization model

Application login roles are rank-based:

- `super_admin` — rank 100
- `admin` — rank 80
- `area_manager` — rank 60
- `data_entry` — rank 40
- `viewer` — rank 20

Area assignments inherit to descendants. Server authorization controls protected pages/actions, while PostgreSQL RLS is the final row-level boundary.

The final hardening also restricts authenticated Data API table grants to the operations the application actually needs. Anonymous access to application tables is revoked.

## Important routes

- `/` — safe entry redirect
- `/login` — authentication
- `/dashboard` — protected operations dashboard
- `/dashboard/members` — member search
- `/dashboard/members/new` — create member
- `/dashboard/members/[id]` — member details
- `/dashboard/members/[id]/edit` — edit member
- `/dashboard/areas` — area hierarchy
- `/dashboard/member-roles` — member classifications
- `/dashboard/users` — admin user management
- `/dashboard/users/[id]` — account management
- `/dashboard/audit` — audit log
- `/api/members/search` — authenticated member-search API

## Environment variables

Only these application variables are required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`

No service-role key, Supabase secret key, database password or Vercel token belongs in the repository.

## Supabase migrations

Repository migrations live in `supabase/migrations` and include the final hardening migration:

- `20260922220000_plmn_workers_security_foundation.sql`
- `20260922223000_member_search_dashboard.sql`
- `20260922224500_fix_member_scope_precedence.sql`
- `20260922230000_security_performance_cleanup.sql`
- `20260922233000_admin_security_audit.sql`
- `20260923103500_final_hardening.sql`

Fresh environments can apply the repository migrations in order.

The connected development PLMN database was iterated through the Supabase management connection; its remote migration history uses tool-generated version IDs that differ from the repository filenames. That existing database must have migration history reconciled before replaying repository migrations. The schema itself was verified after the final hardening SQL was applied directly.

## RLS and database verification

- All eight application tables report `rls_enabled = true`.
- Public/anonymous table access is revoked.
- Authenticated table grants are least-privilege for application usage.
- Supabase Security Advisor: zero findings.
- Performance Advisor: 23 INFO-level unused-index notices on the empty application dataset; indexes are intentionally retained for expected search/audit workloads.
- Rollback-only synthetic RLS tests verified that:
  - out-of-scope member rows are not readable,
  - crafted cross-scope member updates do not modify protected records,
  - viewer scope does not expose member/area data without an area assignment,
  - application profile/role visibility remains restricted.
- No QA fixture data remains in the connected database.

## Performance/reliability hardening

- Member search is paginated at the database RPC and never downloads the complete member dataset to the browser.
- Dashboard statistics are served by one aggregate RPC.
- Parallel database queries are used where appropriate.
- Search requests are debounced and cancellable.
- Mutation errors are mapped to safe user-facing messages instead of leaking database errors.
- Stale/inactive-area and stale/member-role conditions are handled explicitly.
- Unauthorized API calls return 401 without data.
- Stale direct pages resolve through database scope instead of trusting client navigation.
- No service-role/secret references were found in application code.

## Verification commands

GitHub Actions is the authoritative Node environment for the repository:

```bash
npm ci
npm run lint
npm run typecheck
npm run build
```

No separate test framework is currently configured. Production verification therefore includes lint, TypeScript, Next.js production build, direct Supabase/RLS checks, Security Advisor review, repository secret scan, and GitHub tree/diff review.

## Vercel deployment

1. Import the GitHub repository into Vercel.
2. Set `NEXT_PUBLIC_SUPABASE_URL`.
3. Set `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`.
4. Keep the project root at the repository root.
5. Use the normal Next.js build command `npm run build`.
6. Vercel installs from the committed `package-lock.json`.
7. Configure the production Site URL/redirect URLs in Supabase Auth.
8. Create/verify the first active `super_admin` before operational use.

No custom Vercel infrastructure is required.

## First-admin handoff

The connected database has no active application users by design. Create the first trusted Supabase Auth user, then assign the seeded `super_admin` role using the SQL template in `supabase/seed.sql`. Review the initial area hierarchy and user-area assignments before creating subordinate accounts.

## Known limitations / deliberate boundaries

- The project has no separate automated unit/integration test framework yet; CI covers lint, typecheck and production build, while database security is covered by direct RLS checks.
- The connected development database has no real users or members, so full browser CRUD with real production identities must be completed after the first trusted Auth user is created.
- The current production workflow intentionally requires migration-history reconciliation when moving the already-iterated connected database to repository-managed migration versions; fresh Supabase databases can use the repository migration sequence directly.
- Unused-index notices are expected while the production tables are empty and should be reviewed again after real workloads exist.

## Final handoff

The repository has no known compile/import errors from the final CI pipeline, no intentional secret files, no service-role usage, and no public member-data route. The next operational step is first-admin creation plus Vercel/Supabase environment configuration.


## Mobile offline-first delivery

The installable mobile route is now implemented at `/mobile`.

Implemented:

- installable web-app manifest;
- service worker and offline app-shell caching;
- encrypted IndexedDB local state;
- scope-limited full member snapshot synchronization;
- area and member-role caching;
- offline member search;
- offline member create/update/archive;
- queued bidirectional sync;
- optimistic-concurrency checks using `updated_at`;
- conflict resolution between server and local versions;
- online account-status revalidation;
- local data cleared on sign out.

Deliberate boundary: the mobile client never downloads application users outside the signed-in user's authorization scope, and it does not make private supporter data public. The mobile route is intended for authenticated internal use.


## Required phone number

Email/password remains the authentication method. Every active application user must also have a phone number stored in `public.profiles.phone`.

There is no SMS OTP. On first access, users without a saved phone number are redirected to `/setup/phone` and must complete the phone field before accessing role-protected application areas.

The phone is normalized to international format such as `+923001234567`, validated at the database boundary, and is visible to authorized administrators in user management.
