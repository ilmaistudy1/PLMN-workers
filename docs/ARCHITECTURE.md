# Architecture

- Next.js App Router + TypeScript
- Tailwind CSS
- Supabase Auth/PostgreSQL
- @supabase/ssr cookie-based SSR auth
- Vercel-compatible deployment

Browser code uses only the Supabase URL and publishable key. Server auth uses request cookies. Root proxy refreshes sessions with auth.getClaims(). No service-role/secret key is included.

The dashboard layout verifies authentication before rendering. Anonymous users are redirected to /login. No worker/supporter records are queried in Prompt 1.

Prompt 1 intentionally creates no business tables or RLS policies. Those belong to the next stage.
