import { useState, type FormEvent } from "react";
import { Link, Navigate, createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { Brand, Segment } from "@/components/timetable/chrome";
import { GROK_PROVIDERS, authClient, signIn } from "@/lib/auth/client";
import { useCurrentUserState } from "@/lib/auth/use-current-user";
import { safeNext } from "@/lib/safe-next";

type Search = { next?: string };

export const Route = createFileRoute("/login")({
  validateSearch: (search: Record<string, unknown>): Search => ({
    next: typeof search.next === "string" ? safeNext(search.next) : undefined,
  }),
  head: () => ({ meta: [{ title: "Sign in · CUI Attock Timetable" }] }),
  component: Login,
});

function Login() {
  const { next } = Route.useSearch();
  const destination = safeNext(next);
  const navigate = useNavigate();
  const { user, isPending } = useCurrentUserState();
  const [mode, setMode] = useState<"in" | "up">("in");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!isPending && user) return <Navigate to={destination} />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      const result =
        mode === "in"
          ? await authClient.signIn.email({ email: email.trim(), password })
          : await authClient.signUp.email({
              name: name.trim() || email.trim().split("@")[0] || "Student",
              email: email.trim(),
              password,
            });
      if (result.error) {
        setError(result.error.message || "That didn't work. Check your details and try again.");
        return;
      }
      await navigate({ to: destination });
    } catch {
      setError("Couldn't reach the server. Check your connection and try again.");
    } finally {
      setBusy(false);
    }
  }

  async function social(providerId: string) {
    setError(null);
    try {
      await signIn(providerId, { callbackURL: destination, errorCallbackURL: "/login" });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign-in failed.");
    }
  }

  return (
    <div className="app">
      <main className="auth-wrap">
        <div className="auth-card panel">
          <Brand />
          <div className="stack">
            <h1 className="section-title">{mode === "in" ? "Welcome back" : "Create your account"}</h1>
            <p className="quiet">
              An account lets you add friends and plan when you are all free. The timetable itself never
              needs one.
            </p>
          </div>

          <Segment
            label="Sign in or create an account"
            value={mode}
            options={[
              { value: "in", label: "Sign in" },
              { value: "up", label: "Create account" },
            ]}
            onChange={(value) => {
              setMode(value === "up" ? "up" : "in");
              setError(null);
            }}
          />

          <form className="stack" onSubmit={submit}>
            {mode === "up" ? (
              <label className="field">
                <span>Name</span>
                <input
                  className="input"
                  autoComplete="name"
                  value={name}
                  maxLength={60}
                  onChange={(event) => setName(event.target.value)}
                  placeholder="What friends call you"
                />
              </label>
            ) : null}
            <label className="field">
              <span>Email</span>
              <input
                className="input"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
            </label>
            <label className="field">
              <span>Password</span>
              <input
                className="input"
                type="password"
                autoComplete={mode === "in" ? "current-password" : "new-password"}
                required
                minLength={8}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
              />
              {mode === "up" ? <small>At least 8 characters.</small> : null}
            </label>
            {error ? (
              <p className="form-error" role="alert">
                {error}
              </p>
            ) : null}
            <button type="submit" className="btn solid tap" disabled={busy}>
              {busy ? "One moment…" : mode === "in" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="or" aria-hidden>
            <span>or</span>
          </div>
          <div className="stack">
            {GROK_PROVIDERS.map((provider) => (
              <button
                key={provider.providerId}
                type="button"
                className="btn tap"
                onClick={() => void social(provider.providerId)}
              >
                Continue with {provider.label}
              </button>
            ))}
          </div>

          <Link to="/" className="back-link">
            <ArrowLeft size={16} aria-hidden /> Back to the timetable
          </Link>
        </div>
      </main>
    </div>
  );
}
