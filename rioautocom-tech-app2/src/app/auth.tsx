import React from "react";
import { AuthState, getAuth, setAuth, Role } from "./api";

type AuthCtx = { auth: AuthState | null; setAuthState: (a: AuthState | null) => void; logout: () => void; role: Role | null; };
const Ctx = React.createContext<AuthCtx | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [auth, setAuthStateInternal] = React.useState<AuthState | null>(() => getAuth());
  const setAuthState = (a: AuthState | null) => { setAuth(a); setAuthStateInternal(a); };
  const logout = () => setAuthState(null);
  return <Ctx.Provider value={{ auth, setAuthState, logout, role: auth?.role || null }}>{children}</Ctx.Provider>;
}

export function useAuth() {
  const ctx = React.useContext(Ctx);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
