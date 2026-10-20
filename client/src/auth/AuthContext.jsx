import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, ApiError } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api("/auth/me")
      .then((data) => setUser(data.user))
      .catch((err) => {
        if (!(err instanceof ApiError && err.status === 401)) console.error(err.message);
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(async (email, password) => {
    const data = await api("/auth/login", { method: "POST", body: { email, password } });
    setUser(data.user);
  }, []);

  const signup = useCallback(async (fullName, email, password) => {
    const data = await api("/auth/signup", { method: "POST", body: { fullName, email, password } });
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await api("/auth/logout", { method: "POST" });
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ user, loading, login, signup, logout }),
    [user, loading, login, signup, logout],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used inside AuthProvider");
  return ctx;
}
