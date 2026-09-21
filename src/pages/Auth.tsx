import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router";
import { motion } from "framer-motion";
import { Mail, Lock, Eye, EyeOff, User, Loader2 } from "lucide-react";
import LogoMark from "../components/LogoMark";
import { api } from "../lib/api";
import type { AuthConfig } from "../lib/contract";

/* ---------- social icons ---------- */

function GithubIcon() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="currentColor">
      <path d="M12 .5C5.6.5.5 5.7.5 12.1c0 5.1 3.3 9.4 7.9 11 .6.1.8-.2.8-.6v-2c-3.2.7-3.9-1.6-3.9-1.6-.5-1.3-1.3-1.7-1.3-1.7-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.7 1.3 3.4 1 .1-.8.4-1.3.7-1.6-2.6-.3-5.3-1.3-5.3-5.8 0-1.3.5-2.3 1.2-3.1-.1-.3-.5-1.5.1-3.1 0 0 1-.3 3.2 1.2a11 11 0 0 1 5.8 0C17.4 4.7 18.4 5 18.4 5c.6 1.6.2 2.8.1 3.1.8.8 1.2 1.8 1.2 3.1 0 4.5-2.7 5.5-5.3 5.8.4.4.8 1.1.8 2.2v3.2c0 .4.2.7.8.6a11.6 11.6 0 0 0 7.9-11C23.5 5.7 18.4.5 12 .5z" />
    </svg>
  );
}

/* ---------- page ---------- */

export default function Auth() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [showPw, setShowPw] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [loading, setLoading] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [authCfg, setAuthCfg] = useState<AuthConfig | null>(null);

  useEffect(() => {
    api.config
      .auth()
      .then(setAuthCfg)
      .catch(() =>
        setAuthCfg({
          email: true,
          siwe: false,
          google: false,
          github: false,
          apple: false,
        }),
      );
  }, []);

  const run = async (key: string, fn: () => Promise<unknown>) => {
    setError(null);
    setLoading(key);
    try {
      await fn();
      navigate("/app");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(null);
    }
  };

  const submitEmail = () =>
    run("email", () =>
      mode === "signup"
        ? api.auth.emailSignup({ email, password, name: name || undefined })
        : api.auth.emailSignin({ email, password }),
    );

  // Wallet connection lives on the canvas (multi-wallet via RainbowKit /
  // WalletConnect) - auth itself is email + GitHub only. First-time GitHub
  // signups answer the onboarding questions; returning users land on the app.
  const githubLabel =
    mode === "signup" ? "Sign up with GitHub" : "Sign in with GitHub";

  return (
    <div className="flex min-h-screen bg-white font-sans text-[#171717] antialiased">
      {/* left illustration panel */}
      <div className="relative hidden w-[44%] flex-col justify-between overflow-hidden bg-[#EAF2EA] p-10 lg:flex">
        <Link to="/" className="relative z-10 flex items-center gap-3">
          <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#171717]">
            <LogoMark className="h-6 w-auto" />
          </span>
          <span>
            <span className="block text-[19px] font-extrabold tracking-tight">
              Stringz
            </span>
            <span className="block text-[11px] font-medium text-[#5a7a64]">
              Visual Web3 automation
            </span>
          </span>
        </Link>
        <motion.img
          src="/assets/auth.png"
          alt="Stringz — visual on-chain automation"
          initial={{ opacity: 0, y: 24 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 24, stiffness: 200 }}
          className="relative z-10 mx-auto w-full max-w-[520px] rounded-[28px]"
        />
        <div className="relative z-10 flex items-center gap-2.5 rounded-2xl px-5 py-4 backdrop-blur">
          <p className="text-[12px] font-medium leading-snug text-[#40513f]">
            Web3 for Everyone.
          </p>
        </div>
      </div>

      {/* right form panel */}
      <div className="flex flex-1 items-center justify-center px-6 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ type: "spring", damping: 26, stiffness: 220 }}
          className="w-full max-w-[400px]"
        >
          <h1 className="text-[34px] font-extrabold tracking-tight">
            {mode === "signin" ? "Sign In" : "Create account"}
          </h1>
          <p className="mt-2 text-[13px] font-medium text-[#8a8a83]">
            {mode === "signin"
              ? "Pick up where your flows left off."
              : "One account for every chain. Simulate free, forever."}
          </p>

          <form
            className="mt-8 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              submitEmail();
            }}
          >
            {mode === "signup" && (
              <div>
                <label className="mb-1.5 block text-[12px] font-semibold text-[#5a5a54]">
                  Name
                </label>
                <div className="flex items-center gap-2.5 rounded-2xl bg-[#F5F5F2] px-4 py-3.5 ring-1 ring-transparent transition focus-within:ring-[#3F6B4F]">
                  <User size={16} className="shrink-0 text-[#9a9a93]" />
                  <input
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="Your name"
                    className="w-full bg-transparent text-[13.5px] font-medium outline-none placeholder:text-[#9a9a93]"
                  />
                </div>
              </div>
            )}
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#5a5a54]">
                Email
              </label>
              <div className="flex items-center gap-2.5 rounded-2xl bg-[#F5F5F2] px-4 py-3.5 ring-1 ring-transparent transition focus-within:ring-[#3F6B4F]">
                <Mail size={16} className="shrink-0 text-[#9a9a93]" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="Enter your email"
                  className="w-full bg-transparent text-[13.5px] font-medium outline-none placeholder:text-[#9a9a93]"
                />
              </div>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-semibold text-[#5a5a54]">
                Password
              </label>
              <div className="flex items-center gap-2.5 rounded-2xl bg-[#F5F5F2] px-4 py-3.5 ring-1 ring-transparent transition focus-within:ring-[#3F6B4F]">
                <Lock size={16} className="shrink-0 text-[#9a9a93]" />
                <input
                  type={showPw ? "text" : "password"}
                  required
                  minLength={mode === "signup" ? 8 : undefined}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={
                    mode === "signup"
                      ? "At least 8 characters"
                      : "Enter your password"
                  }
                  className="w-full bg-transparent text-[13.5px] font-medium outline-none placeholder:text-[#9a9a93]"
                />
                <button
                  type="button"
                  onClick={() => setShowPw((s) => !s)}
                  className="shrink-0 text-[#9a9a93] transition hover:text-[#171717]"
                  aria-label={showPw ? "Hide password" : "Show password"}
                >
                  {showPw ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
            </div>

            {mode === "signin" && (
              <div className="text-right">
                <button
                  type="button"
                  className="text-[12.5px] font-semibold text-[#3F6B4F] hover:underline"
                >
                  Forgot password?
                </button>
              </div>
            )}

            {error && (
              <p className="rounded-2xl bg-[#FDF0F2] px-4 py-3 text-[12.5px] font-medium text-[#C0435A]">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading !== null}
              className="flex w-full items-center justify-center gap-2 rounded-2xl bg-[#3F6B4F] py-4 text-[14.5px] font-bold text-white transition hover:bg-[#35593f] active:scale-[0.99] disabled:opacity-70"
            >
              {loading === "email" && (
                <Loader2 size={16} className="animate-spin" />
              )}
              {mode === "signin" ? "Sign In" : "Create account"}
            </button>
          </form>

          {/* divider */}
          <div className="my-7 flex items-center gap-4">
            <span className="h-px flex-1 bg-[#e6e6e0]" />
            <span className="text-[11.5px] font-medium text-[#9a9a93]">
              Or continue with
            </span>
            <span className="h-px flex-1 bg-[#e6e6e0]" />
          </div>

          {/* socials */}
          <button
            onClick={() => {
              if (!authCfg?.github) return;
              window.location.assign("/oauth/github");
            }}
            disabled={loading !== null}
            aria-label={githubLabel}
            title={
              authCfg?.github
                ? githubLabel
                : "GitHub — configure GITHUB_CLIENT_ID on the server"
            }
            className="relative flex h-12 w-full items-center justify-center gap-2.5 rounded-2xl bg-[#171717] text-[14px] font-bold text-white transition hover:bg-black active:scale-[0.99] disabled:opacity-60"
          >
            {loading === "github" ? (
              <Loader2 size={17} className="animate-spin" />
            ) : (
              <>
                <GithubIcon />
                {githubLabel}
              </>
            )}
            {/* {!authCfg?.github && ( */}
            {/*   <span className="absolute -right-1 -top-1 rounded-full bg-gray-200 px-1.5 py-0.5 text-[8px] font-bold text-gray-600"> */}
            {/*     SOON */}
            {/*   </span> */}
            {/* )} */}
          </button>

          <p className="mt-8 text-center text-[12.5px] font-medium text-[#8a8a83]">
            {mode === "signin"
              ? "Don't have an account? "
              : "Already have an account? "}
            <button
              onClick={() => {
                setMode((m) => (m === "signin" ? "signup" : "signin"));
                setError(null);
              }}
              className="font-bold text-[#3F6B4F] hover:underline"
            >
              {mode === "signin" ? "Sign up" : "Sign in"}
            </button>
          </p>
          <p className="mt-4 text-center text-[10.5px] leading-relaxed text-[#b0b0a9]">
            By continuing you agree to our{" "}
            <a href="/terms" className="font-semibold hover:underline">
              Terms
            </a>{" "}
            &{" "}
            <a href="/privacy" className="font-semibold hover:underline">
              Privacy Policy
            </a>
          </p>
        </motion.div>
      </div>
    </div>
  );
}
