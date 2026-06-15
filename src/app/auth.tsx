import React from "react";
import { AuthState, Role, getAuth, setAuth, normalizeAuth } from "./api";

type AuthCtx = {
  auth: AuthState | null;
  setAuthState: (a: AuthState | null) => void;
  logout: () => void;

  // 🔥 novo:
  roles: Role[];
  role: Role | null; // role ATIVO (modo atual)
  setActiveRole: (r: Role) => void;
  hasRole: (r: Role) => boolean;
};

const Ctx = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthStateInternal] = React.useState<AuthState | null>(() => {
    const a = getAuth();
    return a ? normalizeAuth(a) : null;
  });

  const setAuthState = (a: AuthState | null) => {
    if (!a) {
      setAuth(null);
      setAuthStateInternal(null);
      return;
    }
    const normalized = normalizeAuth(a);
    setAuth(normalized);
    setAuthStateInternal(normalized);
  };

  const logout = () => setAuthState(null);

  const roles = (auth?.roles && auth.roles.length
    ? auth.roles
    : auth?.role
    ? [auth.role]
    : []) as Role[];

  const role = (auth?.active_role || auth?.role || null) as Role | null;

  const setActiveRole = (r: Role) => {
    if (!auth) return;
    if (!roles.includes(r)) return;

    const next = normalizeAuth({ ...auth, active_role: r });
    setAuth(next);
    setAuthStateInternal(next);
  };

  const hasRole = (r: Role) => roles.includes(r);

  // sync multi-tab
  React.useEffect(() => {
    const onStorage = () => {
      const a = getAuth();
      setAuthStateInternal(a ? normalizeAuth(a) : null);
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <Ctx.Provider
      value={{
        auth,
        setAuthState,
        logout,
        roles,
        role,
        setActiveRole,
        hasRole,
      }}
    >
      {children}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
