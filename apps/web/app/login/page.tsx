"use client";

import Link from "next/link";
import { FormEvent, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

import { createSupabaseBrowserClient } from "@/lib/supabase/client";

export default function LoginPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const hasSupabaseEnv =
    !!process.env.NEXT_PUBLIC_SUPABASE_URL &&
    !!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = useMemo(
    () => (hasSupabaseEnv ? createSupabaseBrowserClient() : null),
    [hasSupabaseEnv],
  );

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nextPath = searchParams.get("next") || "/projects";

  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    setIsLoading(true);

    if (!supabase) {
      setError("Missing Supabase environment variables.");
      setIsLoading(false);
      return;
    }

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email,
      password,
    });
    setIsLoading(false);
    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.replace(nextPath);
    router.refresh();
  }

  return (
    <main className="min-h-screen bg-[#fafafa] px-6 py-10">
      <div className="mx-auto w-full max-w-[420px] rounded-[20px] border border-[#f1f1f1] bg-white px-6 py-7 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
        <h1 className="text-[28px] leading-tight font-semibold text-[#111]">
          Log in
        </h1>
        <p className="mt-1 text-sm text-[#777]">
          Welcome back. Continue to your projects.
        </p>

        <form onSubmit={handleSubmit} className="mt-6 space-y-3.5">
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#666]">
              Email
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              required
              className="h-10 w-full rounded-[12px] border border-[#ececec] bg-white px-3 text-sm outline-none focus:border-[#22D3BB]"
            />
          </div>
          <div>
            <label className="mb-1.5 block text-xs font-medium text-[#666]">
              Password
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              minLength={6}
              className="h-10 w-full rounded-[12px] border border-[#ececec] bg-white px-3 text-sm outline-none focus:border-[#22D3BB]"
            />
          </div>

          {error ? <p className="text-xs text-red-600">{error}</p> : null}
          {!hasSupabaseEnv ? (
            <p className="text-xs text-red-600">
              Missing `NEXT_PUBLIC_SUPABASE_URL` and/or
              `NEXT_PUBLIC_SUPABASE_ANON_KEY`.
            </p>
          ) : null}

          <button
            type="submit"
            disabled={isLoading}
            className="h-10 w-full rounded-[12px] bg-[#22D3BB] text-sm font-medium text-white transition hover:bg-[#1ec0aa] disabled:opacity-60"
          >
            {isLoading ? "Logging in..." : "Log in"}
          </button>
        </form>

        <div className="my-4 flex items-center gap-3 text-xs text-[#9a9a9a]">
          <span className="h-px flex-1 bg-[#efefef]" />
          or
          <span className="h-px flex-1 bg-[#efefef]" />
        </div>

        <button
          type="button"
          className="h-10 w-full inline-flex items-center justify-center gap-2 rounded-[12px] border border-[#e6e6e6] bg-[#f5f5f5] text-sm font-medium text-[#333]"
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 24 24"
            fill="currentColor"
            aria-hidden="true"
          >
            <path d="M12 .5C5.65.5.5 5.65.5 12A11.5 11.5 0 0 0 8.36 22.9c.58.1.79-.25.79-.56v-2.17c-3.2.69-3.87-1.36-3.87-1.36-.53-1.32-1.28-1.67-1.28-1.67-1.05-.72.08-.71.08-.71 1.15.08 1.76 1.18 1.76 1.18 1.03 1.76 2.7 1.25 3.36.95.1-.74.4-1.25.72-1.53-2.56-.29-5.25-1.28-5.25-5.72 0-1.27.46-2.3 1.2-3.12-.12-.3-.52-1.5.12-3.12 0 0 .98-.31 3.2 1.19a11.1 11.1 0 0 1 5.82 0c2.22-1.5 3.2-1.19 3.2-1.19.64 1.62.24 2.82.12 3.12.75.82 1.2 1.85 1.2 3.12 0 4.45-2.7 5.43-5.28 5.72.41.36.78 1.06.78 2.14v3.17c0 .31.2.67.8.56A11.5 11.5 0 0 0 23.5 12C23.5 5.65 18.35.5 12 .5Z" />
          </svg>
          Continue with GitHub
        </button>

        <p className="mt-4 text-center text-sm text-[#777]">
          Don&apos;t have an account?{" "}
          <Link
            href="/signup"
            className="font-medium text-[#22D3BB] hover:underline"
          >
            Sign up
          </Link>
        </p>
      </div>
    </main>
  );
}
