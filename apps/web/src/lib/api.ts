const API_URL = '/api';

export async function apiGet<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function apiPut<T>(path: string, token: string, body: any): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiPost<T>(path: string, token: string, body: any): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify(body),
  });
  return res.json();
}

export async function apiDelete<T>(path: string, token: string): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'DELETE',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  });
  return res.json();
}

export async function apiUpload(path: string, token: string, file: File): Promise<{ ok: boolean; path?: string; error?: string }>
{
  const form = new FormData();
  form.append('file', file);
  const res = await fetch(`${API_URL}${path}`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  return res.json();
}

/** Baixa um arquivo (ex.: CSV) de um endpoint protegido por Bearer token, disparando o download no navegador. */
export async function apiDownload(path: string, token: string, filenameFallback: string): Promise<{ ok: boolean; error?: string }> {
  const res = await fetch(`${API_URL}${path}`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) {
    try {
      const j = await res.json();
      return { ok: false, error: j?.error || 'Falha ao exportar.' };
    } catch {
      return { ok: false, error: 'Falha ao exportar.' };
    }
  }
  const blob = await res.blob();
  const disposition = res.headers.get('Content-Disposition') || '';
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] || filenameFallback;
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
  return { ok: true };
}
