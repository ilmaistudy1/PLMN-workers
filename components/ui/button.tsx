import type { ButtonHTMLAttributes } from "react";
type ButtonProps=ButtonHTMLAttributes<HTMLButtonElement>&{variant?:"primary"|"secondary"|"ghost"};
export function Button({variant="primary",className="",...props}:ButtonProps){const styles={primary:"bg-slate-900 text-white hover:bg-slate-800",secondary:"bg-white text-slate-900 ring-1 ring-slate-200 hover:bg-slate-50",ghost:"text-slate-600 hover:bg-slate-100"};return <button className={`inline-flex min-h-10 items-center justify-center rounded-lg px-4 text-sm font-medium transition ${styles[variant]} ${className}`} {...props}/>}
