const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || '';
export async function apiFetch(path, options) {
  if (!API_BASE_URL) throw new Error('Backend is not configured. Showing clearly labelled demo data.');
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}
