const apiUrl = process.env.NEXT_PUBLIC_API_URL;
if (!apiUrl) {
  throw new Error('Missing NEXT_PUBLIC_API_URL');
}
export const API_BASE_URL = apiUrl;

