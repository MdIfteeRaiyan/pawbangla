import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = { title: "Page not found · PawBangla", description: "This PawBangla page could not be found. Return home or browse pet care, clinics and Pet SOS." };

export default function NotFound() {
  return (
    <main className="min-h-[100dvh] bg-[#f8f7f1] px-6 py-16 text-[#1d302a]">
      <section className="mx-auto flex min-h-[70dvh] max-w-2xl flex-col justify-center rounded-[32px] border border-[#dfe5dc] bg-[#fffefa] p-8 shadow-xl sm:p-12">
        <Link href="/" className="mb-10 inline-flex w-fit items-center gap-3 font-bold text-[#173f36]" aria-label="PawBangla home">
          <span className="grid size-11 place-items-center rounded-2xl bg-[#173f36] text-xl text-white">🐾</span>
          PawBangla
        </Link>
        <p className="text-xs font-extrabold uppercase tracking-[.18em] text-[#e47760]">Page not found · 404</p>
        <h1 className="mt-3 text-4xl font-bold tracking-tight text-[#173f36] sm:text-5xl">Looks like this path wandered off.</h1>
        <p className="mt-4 max-w-xl text-[#66746d]">The page may have moved. Return home or jump to one of PawBangla’s main spaces.</p>
        <div className="mt-7 flex flex-wrap gap-3">
          <Link href="/" className="rounded-full bg-[#173f36] px-5 py-3 font-semibold text-white">Back to home</Link>
          <Link href="/find-care" className="rounded-full border border-[#dfe5dc] px-5 py-3 font-semibold text-[#173f36]">Find care</Link>
          <Link href="/help" className="rounded-full border border-[#dfe5dc] px-5 py-3 font-semibold text-[#173f36]">Pet SOS</Link>
        </div>
      </section>
    </main>
  );
}
