import Link from "next/link";

export default function TeamNotFound() {
  return (
    <main className="mx-auto max-w-[900px] border border-slate-200 bg-white p-8">
      <h2 className="border-b-[3px] border-[#d11938] pb-1.5 text-2xl font-black text-[#12225a]">
        Team not found
      </h2>
      <p className="mt-3 text-sm text-slate-600">
        The team you are looking for does not exist or may have been removed.
      </p>
      <Link
        href="/"
        className="mt-4 inline-block bg-[#12225a] px-4 py-2 text-sm font-bold text-white hover:bg-[#0f1d4d]"
      >
        Back to teams
      </Link>
    </main>
  );
}
