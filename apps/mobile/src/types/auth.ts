// ==========================================
// Authentication Type Definitions
// ==========================================

export interface User {
  id: string;
  name: string;
  token: string;
  refreshToken?: string;
  email?: string;
  idToken?: string;
}

export interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
}
