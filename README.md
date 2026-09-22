# PLMN Workers

Internal authenticated Workers / Supporter Management System.

## Stack
Next.js App Router, TypeScript, Tailwind CSS, Supabase PostgreSQL/Auth, @supabase/ssr, Vercel.

## Local setup
1. Install Node.js 20+.
2. Run npm install.
3. Copy .env.example to .env.local.
4. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY.
5. Run npm run dev.

## Verification
Run npm run lint, npm run typecheck, and npm run build.

## Vercel
Import the repository into Vercel and add the same public Supabase environment variables. Do not expose a Supabase secret/service-role key through NEXT_PUBLIC_* or browser code.

## Scope
Prompt 1 contains only the production foundation and authenticated shell. Worker/supporter business data starts in the next stage.
