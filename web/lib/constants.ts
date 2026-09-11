// API URL configuration
// If NEXT_PUBLIC_API_URL is set, use it
// Otherwise, use relative path '/api/backend' or absolute URL for local
export const API_URL = (() => {
  // If NEXT_PUBLIC_API_URL is set, use it
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  
  // Default to relative path for Next.js proxy
  return '/api/backend';
})();

