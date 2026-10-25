import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Switch, Route } from "wouter";
import { queryClient } from "./lib/queryClient";
import { QueryClientProvider } from "@tanstack/react-query";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import NotFound from "@/pages/not-found";
import Home from "@/pages/Home";
import { useAuthSession, useLogin, useSignup } from "@/hooks/use-auth";

function Router() {
  return (
    <Switch>
      <Route path="/" component={Home} />
      <Route component={NotFound} />
    </Switch>
  );
}

type AuthMode = "signin" | "signup";

function AuthScreen() {
  const [mode, setMode] = useState<AuthMode>("signin");
  const login = useLogin();
  const signup = useSignup();

  const [signinUsername, setSigninUsername] = useState("");
  const [signinPassword, setSigninPassword] = useState("");
  const [signinRememberMe, setSigninRememberMe] = useState(false);

  const [signupUsername, setSignupUsername] = useState("");
  const [signupPassword, setSignupPassword] = useState("");
  const [signupPasswordConfirm, setSignupPasswordConfirm] = useState("");
  const [signupLocalError, setSignupLocalError] = useState<string | null>(null);

  const errorMessage = useMemo(() => {
    if (mode === "signin") {
      return login.error instanceof Error ? login.error.message : null;
    }
    if (signupLocalError) return signupLocalError;
    return signup.error instanceof Error ? signup.error.message : null;
  }, [login.error, mode, signup.error, signupLocalError]);

  useEffect(() => {
    setSignupLocalError(null);
  }, [signupUsername, signupPassword, signupPasswordConfirm, mode]);

  return (
    <div className="min-h-screen flex items-center justify-center px-4 py-10">
      <div className="w-full max-w-md pixel-box p-6 sm:p-8 bg-card/80">
        <h1 className="font-display text-2xl sm:text-3xl text-foreground glow-text">Pixel Heart Tracker</h1>
        <p className="font-body text-lg text-muted-foreground mt-2">
          {mode === "signin" ? "Sign in" : "Sign up"}
        </p>

        {mode === "signin" ? (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              login.mutate({ username: signinUsername, password: signinPassword, rememberMe: signinRememberMe });
            }}
          >
            <div className="space-y-2">
              <label className="font-display text-xs text-foreground" htmlFor="signin-id">
                ID
              </label>
              <input
                id="signin-id"
                value={signinUsername}
                onChange={(e) => setSigninUsername(e.target.value)}
                className="pixel-input w-full px-3 py-3 bg-card/70 text-foreground"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="font-display text-xs text-foreground" htmlFor="signin-password">
                Mot de passe
              </label>
              <input
                id="signin-password"
                type="password"
                value={signinPassword}
                onChange={(e) => setSigninPassword(e.target.value)}
                className="pixel-input w-full px-3 py-3 bg-card/70 text-foreground"
                autoComplete="current-password"
                required
              />
            </div>

            {errorMessage ? <p className="font-body text-lg text-destructive">{errorMessage}</p> : null}

            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <label className="inline-flex items-center gap-2 text-foreground cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={signinRememberMe}
                  onChange={(e) => setSigninRememberMe(e.target.checked)}
                  className="accent-cyan-400"
                />
                <span className="font-body text-lg">Se souvenir de moi</span>
              </label>

              <button
                type="submit"
                disabled={login.isPending}
                className="pixel-button px-4 py-3 bg-transparent border-primary text-foreground disabled:opacity-50"
              >
                {login.isPending ? "Connexion..." : "Sign in"}
              </button>
            </div>

            <button
              type="button"
              onClick={() => setMode("signup")}
              className="w-full text-left font-body text-lg text-cyan-300 hover:text-cyan-200"
            >
              Pas encore de compte ? Cliquez ici
            </button>
          </form>
        ) : (
          <form
            className="mt-5 space-y-4"
            onSubmit={(e) => {
              e.preventDefault();
              if (signupPassword !== signupPasswordConfirm) {
                setSignupLocalError("Les mots de passe ne correspondent pas.");
                return;
              }
              signup.mutate({ username: signupUsername, password: signupPassword });
            }}
          >
            <div className="space-y-2">
              <label className="font-display text-xs text-foreground" htmlFor="signup-id">
                Choisir un ID
              </label>
              <input
                id="signup-id"
                value={signupUsername}
                onChange={(e) => setSignupUsername(e.target.value)}
                className="pixel-input w-full px-3 py-3 bg-card/70 text-foreground"
                autoComplete="username"
                required
              />
            </div>

            <div className="space-y-2">
              <label className="font-display text-xs text-foreground" htmlFor="signup-password">
                Mot de passe
              </label>
              <input
                id="signup-password"
                type="password"
                value={signupPassword}
                onChange={(e) => setSignupPassword(e.target.value)}
                className="pixel-input w-full px-3 py-3 bg-card/70 text-foreground"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            <div className="space-y-2">
              <label className="font-display text-xs text-foreground" htmlFor="signup-password-confirm">
                Confirmer le mot de passe
              </label>
              <input
                id="signup-password-confirm"
                type="password"
                value={signupPasswordConfirm}
                onChange={(e) => setSignupPasswordConfirm(e.target.value)}
                className="pixel-input w-full px-3 py-3 bg-card/70 text-foreground"
                autoComplete="new-password"
                required
                minLength={8}
              />
            </div>

            {errorMessage ? <p className="font-body text-lg text-destructive">{errorMessage}</p> : null}

            <button
              type="submit"
              disabled={signup.isPending}
              className="pixel-button w-full px-4 py-3 bg-transparent border-primary text-foreground disabled:opacity-50"
            >
              {signup.isPending ? "Création..." : "Sign up"}
            </button>

            <button
              type="button"
              onClick={() => setMode("signin")}
              className="w-full text-left font-body text-lg text-cyan-300 hover:text-cyan-200"
            >
              Déjà un compte ? Cliquez ici
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

function OverlayModal({
  open,
  title,
  children,
  onClose,
}: {
  open: boolean;
  title: string;
  children: ReactNode;
  onClose?: () => void;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/55 px-4">
      <div className="w-full max-w-md pixel-box p-6 bg-card/80">
        <div className="flex items-start justify-between gap-4">
          <h2 className="font-display text-sm sm:text-base text-foreground glow-text">{title}</h2>
          {onClose ? (
            <button
              type="button"
              onClick={onClose}
              className="pixel-button px-2 py-1 text-[10px] bg-transparent border-primary text-foreground"
              aria-label="Close"
            >
              X
            </button>
          ) : null}
        </div>
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function FirstSignupOnboardingModal({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return (
    <OverlayModal open={open} title="Bienvenue !" onClose={onClose}>
      <p className="font-body text-lg text-foreground">
        Souhaitez vous importer des données d'un autre tracker, ou commencer à 0 ?
      </p>
      <div className="mt-4 flex flex-col sm:flex-row gap-2 sm:justify-end">
        <button
          type="button"
          onClick={() => {
            if (typeof window !== "undefined") {
              window.sessionStorage.setItem("pixel-heart.openTrackerSettingsImport", "1");
              window.dispatchEvent(new Event("pixel-heart:openTrackerSettingsImport"));
            }
            onClose();
          }}
          className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground"
        >
          Importer des données
        </button>
        <button
          type="button"
          onClick={onClose}
          className="pixel-button px-3 py-2 bg-transparent border-primary text-foreground"
        >
          Commencer à 0
        </button>
      </div>
    </OverlayModal>
  );
}

function AuthenticatedApp() {
  const authQuery = useAuthSession();
  const [showFirstSignupOnboarding, setShowFirstSignupOnboarding] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!authQuery.data?.authenticated || !authQuery.data.user) return;

    if (window.sessionStorage.getItem("pixel-heart.justSignedUp") === "1") {
      window.sessionStorage.removeItem("pixel-heart.justSignedUp");
      setShowFirstSignupOnboarding(true);
    }
  }, [authQuery.data?.authenticated, authQuery.data?.user?.id]);

  if (authQuery.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <p className="font-display text-sm text-foreground animate-pulse">Loading session...</p>
      </div>
    );
  }

  const session = authQuery.data;
  if (!session?.authenticated || !session.user) {
    return <AuthScreen />;
  }

  return (
    <>
      <FirstSignupOnboardingModal
        open={showFirstSignupOnboarding}
        onClose={() => setShowFirstSignupOnboarding(false)}
      />
      <Router />
    </>
  );
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <AuthenticatedApp />
      </TooltipProvider>
    </QueryClientProvider>
  );
}

export default App;
