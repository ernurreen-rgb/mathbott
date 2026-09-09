import { normalizeProxyRequestBody } from "../proxy-request-body";

describe("normalizeProxyRequestBody", () => {
  it("removes an empty body when Content-Type is unspecified", () => {
    expect(normalizeProxyRequestBody("", "")).toBeUndefined();
    expect(normalizeProxyRequestBody("", "   ")).toBeUndefined();
  });

  it("keeps empty bodies with an explicit Content-Type", () => {
    expect(normalizeProxyRequestBody("", "application/json")).toBe("");
  });

  it("keeps non-empty request bodies", () => {
    expect(normalizeProxyRequestBody("payload", "")).toBe("payload");
  });
});
