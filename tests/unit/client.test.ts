import { describe, it, expect, vi, beforeEach } from "vitest";
import { BimpClient } from "../../src/client.js";

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

describe("BimpClient", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should create client with default base URL", () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });
    expect(client).toBeDefined();
  });

  it("should auto-login on first request", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Mock login response
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-123", refreshToken: "rt-456" },
        }),
      })
      // Mock selectCompany response
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-789" },
        }),
      })
      // Mock actual request
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [{ uuid: "a" }] }),
      });

    const result = await client.request(
      "POST",
      "/org2/nomenclature/api-readList",
      { pagination: { offset: 0, count: 10 } }
    );

    expect(result).toEqual({ success: true, data: [{ uuid: "a" }] });
    expect(mockFetch).toHaveBeenCalledTimes(3);

    // Verify login call
    const loginCall = mockFetch.mock.calls[0];
    expect(loginCall[0]).toContain("/org2/auth/api-login");

    // Verify selectCompany call
    const selectCall = mockFetch.mock.calls[1];
    expect(selectCall[0]).toContain("/org2/auth/api-selectCompany");

    // Verify actual request has access-token header
    const apiCall = mockFetch.mock.calls[2];
    expect(apiCall[1].headers["access-token"]).toBe("cat-789");
  });

  it("should reuse token on subsequent requests", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Login + selectCompany + first request
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-123", refreshToken: "rt-456" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-789" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      })
      // Second request — no login needed
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

    await client.request("POST", "/org2/nomenclature/api-readList", {});
    await client.request("POST", "/org2/nomenclature/api-readList", {});

    // 3 for first request (login + select + api), 1 for second
    expect(mockFetch).toHaveBeenCalledTimes(4);
  });

  it("should refresh token on 401 and retry", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Initial login + selectCompany
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-123", refreshToken: "rt-456" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-789" },
        }),
      })
      // First attempt — 401
      .mockResolvedValueOnce({ ok: false, status: 401, json: async () => ({}) })
      // Refresh token
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at-new", refreshToken: "rt-new" },
        }),
      })
      // Re-selectCompany
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat-new" },
        }),
      })
      // Retry request — success
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [{ uuid: "b" }] }),
      });

    const result = await client.request(
      "POST",
      "/org2/nomenclature/api-readList",
      {}
    );

    expect(result).toEqual({ success: true, data: [{ uuid: "b" }] });
  });

  it("should handle GET requests with query params", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    // Login + select + request
    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at", refreshToken: "rt" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: [] }),
      });

    await client.request("GET", "/org2/inventory/api-readList", {
      page: 1,
      pageSize: 50,
    });

    const apiCall = mockFetch.mock.calls[2];
    expect(apiCall[0]).toContain("page=1");
    expect(apiCall[0]).toContain("pageSize=50");
    expect(apiCall[1].method).toBe("GET");
  });

  it("should substitute path parameters", async () => {
    const client = new BimpClient({
      email: "test@test.com",
      password: "pass",
      companyCode: "000001",
    });

    mockFetch
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { accessToken: "at", refreshToken: "rt" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { companyAccessToken: "cat" },
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ success: true, data: {} }),
      });

    await client.request(
      "GET",
      "/org2/inventory/api-read/{productHex}/stock",
      { productHex: "abc123", orgId: "org1" }
    );

    const apiCall = mockFetch.mock.calls[2];
    expect(apiCall[0]).toContain("/org2/inventory/api-read/abc123/stock");
    expect(apiCall[0]).toContain("orgId=org1");
    expect(apiCall[0]).not.toContain("productHex");
  });
});
