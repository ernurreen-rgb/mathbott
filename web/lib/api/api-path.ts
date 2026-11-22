import { API_URL } from "../constants";

/** The URL of an API path: through the site's proxy (/api/backend/...) or a direct API URL. */
export const apiPath = (path: string): string => {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL || API_URL;
  const baseUrl = apiUrl.replace(/\/$/, "");
  const cleanPath = path.startsWith("/") ? path.slice(1) : path;

  if (baseUrl.startsWith("/")) {
    return `${baseUrl}/${cleanPath}`;
  } else {
    return `${baseUrl}/api/${cleanPath}`;
  }
};
