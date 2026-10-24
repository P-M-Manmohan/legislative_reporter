import { Capacitor } from '@capacitor/core';

const isLocalWeb = !Capacitor.isNativePlatform()
  && ['localhost', '127.0.0.1'].includes(window.location.hostname);
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL
  || (isLocalWeb ? 'http://127.0.0.1:8001' : 'https://legislative-reporter-api.onrender.com');
export async function apiFetch(path, options) {
  if (!API_BASE_URL) throw new Error('Backend is not configured. Showing clearly labelled demo data.');
  const response = await fetch(`${API_BASE_URL}${path}`, options);
  if (!response.ok) throw new Error(`Request failed with status ${response.status}`);
  return response.json();
}
