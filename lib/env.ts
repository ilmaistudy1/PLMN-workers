function requiredPublicEnv(name:string):string { const value=process.env[name]; if(!value) throw new Error(`Missing required environment variable: ${name}`); return value; }
export function getSupabasePublicEnv(){return {url:requiredPublicEnv("NEXT_PUBLIC_SUPABASE_URL"),publishableKey:requiredPublicEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY")};}
