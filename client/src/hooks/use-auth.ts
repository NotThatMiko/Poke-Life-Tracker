import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { QueryClient } from "@tanstack/react-query";
import {
  api,
  type AuthChangePasswordInput,
  type AuthChangeUsernameInput,
  type AuthCreateUserInput,
  type AuthDeleteAccountInput,
  type AuthLoginInput,
  type AuthSessionsListResponse,
  type AuthSignupInput,
} from "@shared/routes";

export const AUTH_SESSION_QUERY_KEY = [api.auth.me.path] as const;

function clearQueriesPreservingAuthSession(queryClient: QueryClient) {
  queryClient.removeQueries({
    predicate: (query) => {
      const key = query.queryKey;
      return !(Array.isArray(key) && key.length === 1 && key[0] === AUTH_SESSION_QUERY_KEY[0]);
    },
  });
}

export function useAuthSession() {
  return useQuery({
    queryKey: AUTH_SESSION_QUERY_KEY,
    queryFn: async () => {
      const res = await fetch(api.auth.me.path, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch auth session");
      return api.auth.me.responses[200].parse(await res.json());
    },
    refetchOnMount: "always",
    refetchOnWindowFocus: true,
    staleTime: 0,
  });
}

export function useAuthSessions(enabled = true) {
  return useQuery({
    queryKey: [api.auth.sessions.path],
    queryFn: async () => {
      const res = await fetch(api.auth.sessions.path, { credentials: "include", cache: "no-store" });
      if (!res.ok) throw new Error("Failed to fetch active sessions");
      return api.auth.sessions.responses[200].parse(await res.json()) as AuthSessionsListResponse;
    },
    enabled,
    refetchOnWindowFocus: enabled,
    staleTime: 0,
  });
}

export function useLogin() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AuthLoginInput) => {
      const res = await fetch(api.auth.login.path, {
        method: api.auth.login.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Login failed";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(message);
      }
      return api.auth.login.responses[200].parse(await res.json());
    },
    onSuccess: (session) => {
      clearQueriesPreservingAuthSession(queryClient);
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useSignup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AuthSignupInput) => {
      const res = await fetch(api.auth.signup.path, {
        method: api.auth.signup.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Signup failed";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      return api.auth.signup.responses[200].parse(await res.json());
    },
    onSuccess: (session) => {
      if (typeof window !== "undefined") {
        window.sessionStorage.setItem("pixel-heart.justSignedUp", "1");
      }
      clearQueriesPreservingAuthSession(queryClient);
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useLogout() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.logout.path, {
        method: api.auth.logout.method,
        credentials: "include",
      });
      if (!res.ok) throw new Error("Logout failed");
      return api.auth.logout.responses[200].parse(await res.json());
    },
    onSuccess: (session) => {
      clearQueriesPreservingAuthSession(queryClient);
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useLogoutOtherSessions() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const res = await fetch(api.auth.logoutOtherSessions.path, {
        method: api.auth.logoutOtherSessions.method,
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to logout other sessions";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      return api.auth.logoutOtherSessions.responses[200].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: [api.auth.sessions.path] });
    },
  });
}

export function useChangePassword() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AuthChangePasswordInput) => {
      const res = await fetch(api.auth.changePassword.path, {
        method: api.auth.changePassword.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to change password";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      return api.auth.changePassword.responses[200].parse(await res.json());
    },
    onSuccess: (session) => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useChangeUsername() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AuthChangeUsernameInput) => {
      const res = await fetch(api.auth.changeUsername.path, {
        method: api.auth.changeUsername.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to change username";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      return api.auth.changeUsername.responses[200].parse(await res.json());
    },
    onSuccess: (session) => {
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useDeleteAccount() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AuthDeleteAccountInput) => {
      const res = await fetch(api.auth.deleteAccount.path, {
        method: api.auth.deleteAccount.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to delete account";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore
        }
        throw new Error(message);
      }
      return api.auth.deleteAccount.responses[200].parse(await res.json());
    },
    onSuccess: (session) => {
      clearQueriesPreservingAuthSession(queryClient);
      queryClient.setQueryData(AUTH_SESSION_QUERY_KEY, session);
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}

export function useCreateUser() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: AuthCreateUserInput) => {
      const res = await fetch(api.auth.createUser.path, {
        method: api.auth.createUser.method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
        credentials: "include",
      });
      if (!res.ok) {
        let message = "Failed to create user";
        try {
          const body = await res.json();
          message = body?.message || message;
        } catch {
          // ignore JSON parse failure
        }
        throw new Error(message);
      }
      return api.auth.createUser.responses[201].parse(await res.json());
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: AUTH_SESSION_QUERY_KEY });
    },
  });
}
