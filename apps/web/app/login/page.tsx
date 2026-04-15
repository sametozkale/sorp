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
  const [showPassword, setShowPassword] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [isGithubLoading, setIsGithubLoading] = useState(false);
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

  async function handleGithubContinue() {
    setError(null);
    setIsGithubLoading(true);

    if (!supabase) {
      setError("Missing Supabase environment variables.");
      setIsGithubLoading(false);
      return;
    }

    const redirectTo = `${window.location.origin}${nextPath}`;
    const { error: oauthError } = await supabase.auth.signInWithOAuth({
      provider: "github",
      options: {
        redirectTo,
      },
    });

    if (oauthError) {
      setError(oauthError.message);
      setIsGithubLoading(false);
    }
  }

  return (
    <main className="min-h-screen bg-white px-6 py-10 flex items-center justify-center">
      <div className="w-full max-w-[420px] flex flex-col items-center">
        <div className="w-full rounded-[20px] border border-[#f1f1f1] bg-white px-6 py-7 shadow-[0_8px_30px_rgba(0,0,0,0.04)]">
          <div className="mb-4">
            <svg
              width="32"
              height="32"
              viewBox="0 0 72 72"
              fill="none"
              xmlns="http://www.w3.org/2000/svg"
              aria-hidden="true"
            >
              <rect width="72" height="72" rx="16" fill="#22D3BB" />
              <g clipPath="url(#login-logo-clip)">
                <rect
                  x="31.6024"
                  y="31.6002"
                  width="8.79518"
                  height="8.79518"
                  rx="1.93976"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M26.9157 16.0605H31.8317C32.9028 16.0607 33.7711 16.9288 33.7711 18V22.916C33.771 23.987 32.9027 24.8553 31.8317 24.8555H24.9762V18C24.9762 16.9287 25.8444 16.0605 26.9157 16.0605Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M18 24.9762H24.8555V31.8317C24.8553 32.9027 23.987 33.7709 22.916 33.7711H18C16.9288 33.7711 16.0607 32.9028 16.0605 31.8317V26.9156C16.0605 25.8444 16.9287 24.9762 18 24.9762Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M54.0004 24.9762C55.0715 24.9764 55.9398 25.8445 55.9398 26.9156V31.8317C55.9396 32.9027 55.0714 33.7709 54.0004 33.7711H49.0844C48.0132 33.7711 47.1451 32.9028 47.1449 31.8317V24.9762H54.0004Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M49.0844 38.1406H54.0004C55.0715 38.1408 55.9398 39.0088 55.9398 40.08V44.996C55.9396 46.0671 55.0714 46.9353 54.0004 46.9355H47.1449V40.08C47.1449 39.0087 48.0131 38.1406 49.0844 38.1406Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M40.1687 47.0605H47.0242V53.916C47.024 54.987 46.1558 55.8553 45.0847 55.8555H40.1687C39.0976 55.8555 38.2295 54.9872 38.2293 53.916V49C38.2293 47.9287 39.0974 47.0605 40.1687 47.0605Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M31.8317 47.0605C32.9028 47.0607 33.7711 47.9288 33.7711 49V53.916C33.771 54.987 32.9027 55.8553 31.8317 55.8555H26.9157C25.8445 55.8555 24.9764 54.9872 24.9762 53.916V47.0605H31.8317Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M18 38.1406H22.916C23.9872 38.1408 24.8555 39.0088 24.8555 40.08V46.9355H18C16.9288 46.9355 16.0607 46.0672 16.0605 44.996V40.08C16.0605 39.0087 16.9287 38.1406 18 38.1406Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
                <path
                  d="M40.1687 16.0605H45.0847C46.1559 16.0607 47.0242 16.9288 47.0242 18V24.8555H40.1687C39.0976 24.8555 38.2295 23.9872 38.2293 22.916V18C38.2293 16.9287 39.0974 16.0605 40.1687 16.0605Z"
                  fill="white"
                  stroke="white"
                  strokeWidth="0.120482"
                />
              </g>
              <defs>
                <clipPath id="login-logo-clip">
                  <rect
                    width="40"
                    height="40"
                    fill="white"
                    transform="translate(16 16)"
                  />
                </clipPath>
              </defs>
            </svg>
          </div>
          <h1 className="text-[28px] leading-tight font-semibold text-[#111]">
            Log in to Sorp AI
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
              <div className="group relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  required
                  minLength={6}
                  className="h-10 w-full rounded-[12px] border border-[#ececec] bg-white px-3 pr-10 text-sm outline-none focus:border-[#22D3BB]"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-[#888] opacity-0 transition-opacity group-hover:opacity-100 focus:opacity-100"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M17.94 17.94A10.94 10.94 0 0 1 12 20c-5 0-9.27-3.11-11-8 1.02-2.88 2.96-5.06 5.38-6.32" />
                      <path d="M9.9 4.24A10.93 10.93 0 0 1 12 4c5 0 9.27 3.11 11 8a10.98 10.98 0 0 1-4.18 5.32" />
                      <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                      <path d="m1 1 22 22" />
                    </svg>
                  ) : (
                    <svg
                      width="16"
                      height="16"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M2.06 12C3.8 7.11 8.06 4 12 4s8.2 3.11 9.94 8C20.2 16.89 15.94 20 12 20S3.8 16.89 2.06 12Z" />
                      <circle cx="12" cy="12" r="3" />
                    </svg>
                  )}
                </button>
              </div>
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
              className="btn-primary btn-primary-lg w-full"
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
            onClick={() => void handleGithubContinue()}
            disabled={isGithubLoading || isLoading || !hasSupabaseEnv}
            className="h-10 w-full inline-flex items-center justify-center gap-2 rounded-[12px] bg-[#f5f5f5] text-sm font-medium text-[#333]"
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
            {isGithubLoading ? "Redirecting..." : "Continue with GitHub"}
          </button>
        </div>
        <p className="mt-8 text-center text-sm text-[#777]">
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
