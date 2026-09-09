export function normalizeProxyRequestBody(
  body: BodyInit | undefined,
  contentType: string
): BodyInit | undefined {
  if (body === "" && !contentType.trim()) return undefined;
  return body;
}
