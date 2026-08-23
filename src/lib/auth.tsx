/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getApps, initializeApp, type FirebaseOptions } from "firebase/app";
import {
  browserLocalPersistence,
  createUserWithEmailAndPassword,
  getAuth,
  onAuthStateChanged,
  sendPasswordResetEmail,
  setPersistence,
  signInWithEmailAndPassword,
  signOut as firebaseSignOut,
  updateProfile,
  type User
} from "firebase/auth";
import { apiRequest, apiUrl } from "./api";
import { currentCampaignAttribution } from "./attribution";

interface AuthContextValue {
  user: User | null;
  loading: boolean;
  error: string;
  signIn(email: string, password: string): Promise<void>;
  signUp(name: string, email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  resetPassword(email: string): Promise<void>;
  updateDisplayName(name: string): Promise<void>;
  token(forceRefresh?: boolean): Promise<string>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [authReady, setAuthReady] = useState(false);

  useEffect(() => {
    let unsubscribe: () => void = () => {};
    fetch(apiUrl("/api/config"))
      .then(async (response) => {
        if (!response.ok) throw new Error("Account service is not available.");
        const config = await response.json() as FirebaseOptions;
        const app = getApps()[0] || initializeApp(config);
        const auth = getAuth(app);
        await setPersistence(auth, browserLocalPersistence);
        unsubscribe = onAuthStateChanged(auth, (nextUser) => {
          setUser(nextUser);
          setLoading(false);
        });
        setAuthReady(true);
      })
      .catch((setupError) => {
        setError(setupError instanceof Error ? setupError.message : "Account service is not available.");
        setLoading(false);
      });
    return () => unsubscribe();
  }, []);

  const getReadyAuth = () => {
    if (!authReady || !getApps()[0]) throw new Error("Account service is still loading.");
    return getAuth(getApps()[0]);
  };

  const value: AuthContextValue = {
    user,
    loading,
    error,
    async signIn(email, password) {
      setError("");
      try { await signInWithEmailAndPassword(getReadyAuth(), email, password); }
      catch (authError) { throw new Error(humanAuthError(authError)); }
    },
    async signUp(name, email, password) {
      setError("");
      try {
        const credential = await createUserWithEmailAndPassword(getReadyAuth(), email, password);
        await updateProfile(credential.user, { displayName: name.trim() });
        setUser(credential.user);
        void apiRequest<{ recorded: boolean }>("/api/lifecycle/account-created", await credential.user.getIdToken(), {
          method: "POST",
          body: JSON.stringify({ attribution: currentCampaignAttribution() })
        }).catch(() => undefined);
      } catch (authError) { throw new Error(humanAuthError(authError)); }
    },
    async signOut() { await firebaseSignOut(getReadyAuth()); },
    async resetPassword(email) { await sendPasswordResetEmail(getReadyAuth(), email); },
    async updateDisplayName(name) {
      const clean = name.trim().replace(/\s+/g, " ").slice(0, 120);
      if (!clean) throw new Error("Enter a name to save your profile.");
      if (!user) throw new Error("Sign in to update your profile.");
      await updateProfile(user, { displayName: clean });
    },
    async token(forceRefresh = false) {
      if (!user) throw new Error("Sign in to continue.");
      return user.getIdToken(forceRefresh);
    }
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider.");
  return context;
}

function humanAuthError(error: unknown) {
  const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
  if (code.includes("email-already-in-use")) return "An account already exists for this email.";
  if (code.includes("invalid-credential")) return "The email or password is incorrect.";
  if (code.includes("weak-password")) return "Use a password with at least eight characters.";
  if (code.includes("invalid-email")) return "Enter a valid work email.";
  if (code.includes("too-many-requests")) return "Too many attempts. Wait a few minutes and try again.";
  return "We could not complete the account request. Please try again.";
}
