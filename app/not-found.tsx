import Link from "next/link";
export default function NotFound(){return <main className="flex min-h-screen items-center justify-center p-5"><div className="text-center"><p className="text-sm font-semibold text-slate-500">404</p><h1 className="mt-1 text-2xl font-bold">Page not found</h1><Link href="/" className="mt-5 inline-block text-sm font-medium underline">Return home</Link></div></main>}
