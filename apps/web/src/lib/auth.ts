export type AuthUser = { id: string; username?: string | null; name?: string | null; lastName?: string | null; email?: string | null; avatarUrl?: string | null };

export function setAuth(token: string, user: AuthUser) {
  const data = { token, user };
  localStorage.setItem('auth', JSON.stringify(data));
}

export function getToken(): string | null {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.token ?? null;
  } catch {
    return null;
  }
}

export function getUser(): AuthUser | null {
  const raw = localStorage.getItem('auth');
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return parsed?.user ?? null;
  } catch {
    return null;
  }
}

export function clearAuth() {
  localStorage.removeItem('auth');
}