import { createContext, useContext } from 'react';
import { Session, User } from '@supabase/supabase-js';

type Subscription = 'pro' | 'standard' | 'free';

interface AuthContextType {
  session: Session | null;
  user: User | null;
  hasTrialed: boolean;
  subscription: Subscription;
  generationsRemaining: number;
  isLoading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, name: string) => Promise<void>;
  signOut: () => Promise<void>;
  signInWithMagicLink: (email: string) => Promise<void>;
  verifyOtp: (email: string, token: string) => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  updatePassword: (password: string) => Promise<void>;
}

export const AuthContext = createContext<AuthContextType | undefined>(
  undefined,
);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
