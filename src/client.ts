export interface BimpClientConfig {
  email: string;
  password: string;
  companyCode: string;
  baseUrl?: string;
  timeout?: number;
}

interface TokenState {
  accessToken: string;
  refreshToken: string;
  companyAccessToken: string;
}

export class BimpClient {
  private config: Required<BimpClientConfig>;
  private tokens: TokenState | null = null;
  private loginPromise: Promise<void> | null = null;

  constructor(config: BimpClientConfig) {
    this.config = {
      ...config,
      baseUrl: config.baseUrl ?? "https://app.bimpsoft.com",
      timeout: config.timeout ?? 30_000,
    };
  }

  async request(
    method: string,
    path: string,
    params: Record<string, unknown> = {},
    options?: { timeout?: number }
  ): Promise<unknown> {
    await this.ensureAuthenticated();
    const result = await this.executeRequest(method, path, params, options?.timeout);

    if (result.status === 401) {
      await this.refreshAuth();
      const retry = await this.executeRequest(method, path, params, options?.timeout);
      if (!retry.ok) {
        throw new Error(`BIMP API error: ${retry.status} on ${method} ${path}`);
      }
      return retry.data;
    }

    if (!result.ok) {
      throw new Error(`BIMP API error: ${result.status} on ${method} ${path}`);
    }
    return result.data;
  }

  async switchCompany(codeOrUuid: string): Promise<void> {
    if (!this.tokens) {
      throw new Error("Must be logged in before switching company");
    }
    const body: Record<string, string> = codeOrUuid.includes("-")
      ? { uuid: codeOrUuid }
      : { code: codeOrUuid };

    const resp = await this.rawFetch(
      "POST",
      "/org2/auth/api-selectCompany",
      body,
      { "access-token": this.tokens.accessToken }
    );
    const json = (await resp.json()) as {
      success: boolean;
      data: { companyAccessToken: string };
    };
    if (!json.success) {
      throw new Error("Failed to switch company");
    }
    this.tokens.companyAccessToken = json.data.companyAccessToken;
  }

  async listCompanies(): Promise<unknown> {
    await this.ensureAuthenticated();
    const resp = await this.rawFetch(
      "POST",
      "/org2/company/api-readDetailedList",
      {},
      { "access-token": this.tokens!.accessToken }
    );
    const json = (await resp.json()) as { success: boolean; data: unknown };
    return json.data;
  }

  private async ensureAuthenticated(): Promise<void> {
    if (this.tokens) return;
    if (this.loginPromise) {
      await this.loginPromise;
      return;
    }
    this.loginPromise = this.login();
    try {
      await this.loginPromise;
    } finally {
      this.loginPromise = null;
    }
  }

  private async login(): Promise<void> {
    const loginResp = await this.rawFetch(
      "POST",
      "/org2/auth/api-login",
      { email: this.config.email, password: this.config.password },
      {}
    );
    const loginJson = (await loginResp.json()) as {
      success: boolean;
      data: { accessToken: string; refreshToken: string };
    };
    if (!loginJson.success) {
      throw new Error("BIMP login failed");
    }

    const selectResp = await this.rawFetch(
      "POST",
      "/org2/auth/api-selectCompany",
      { code: this.config.companyCode },
      { "access-token": loginJson.data.accessToken }
    );
    const selectJson = (await selectResp.json()) as {
      success: boolean;
      data: { companyAccessToken: string };
    };
    if (!selectJson.success) {
      throw new Error("BIMP company selection failed");
    }

    this.tokens = {
      accessToken: loginJson.data.accessToken,
      refreshToken: loginJson.data.refreshToken,
      companyAccessToken: selectJson.data.companyAccessToken,
    };
  }

  private async refreshAuth(): Promise<void> {
    if (!this.tokens) {
      await this.login();
      return;
    }

    try {
      const refreshResp = await this.rawFetch(
        "POST",
        "/org2/auth/api-refresh",
        { refreshToken: this.tokens.refreshToken },
        { "access-token": this.tokens.accessToken }
      );

      if (!refreshResp.ok) {
        this.tokens = null;
        await this.login();
        return;
      }

      const refreshJson = (await refreshResp.json()) as {
        success: boolean;
        data: { accessToken: string; refreshToken: string };
      };

      const selectResp = await this.rawFetch(
        "POST",
        "/org2/auth/api-selectCompany",
        { code: this.config.companyCode },
        { "access-token": refreshJson.data.accessToken }
      );
      const selectJson = (await selectResp.json()) as {
        success: boolean;
        data: { companyAccessToken: string };
      };

      this.tokens = {
        accessToken: refreshJson.data.accessToken,
        refreshToken: refreshJson.data.refreshToken,
        companyAccessToken: selectJson.data.companyAccessToken,
      };
    } catch {
      this.tokens = null;
      await this.login();
    }
  }

  private async executeRequest(
    method: string,
    pathTemplate: string,
    params: Record<string, unknown>,
    timeout?: number
  ): Promise<{ ok: boolean; status: number; data: unknown }> {
    const resp = await this.rawFetch(
      method,
      pathTemplate,
      params,
      { "access-token": this.tokens!.companyAccessToken },
      timeout
    );

    if (resp.status === 401) {
      return { ok: false, status: 401, data: null };
    }

    const json = (await resp.json()) as unknown;
    return { ok: resp.ok, status: resp.status, data: json };
  }

  private async rawFetch(
    method: string,
    pathTemplate: string,
    params: Record<string, unknown>,
    headers: Record<string, string>,
    timeout?: number
  ): Promise<Response> {
    let path = pathTemplate;
    const bodyParams = { ...params };
    const pathParamRegex = /\{(\w+)\}/g;
    let match;
    while ((match = pathParamRegex.exec(pathTemplate)) !== null) {
      const paramName = match[1];
      if (paramName in bodyParams) {
        path = path.replace(`{${paramName}}`, String(bodyParams[paramName]));
        delete bodyParams[paramName];
      }
    }

    let url = `${this.config.baseUrl}${path}`;

    const fetchOptions: RequestInit & { signal?: AbortSignal } = {
      method,
      headers: {
        "accept-language": "uk-UA",
        "content-type": "application/json",
        ...headers,
      },
    };

    if (method === "GET") {
      const queryParams = new URLSearchParams();
      for (const [key, value] of Object.entries(bodyParams)) {
        if (value !== undefined && value !== null) {
          queryParams.set(key, String(value));
        }
      }
      const qs = queryParams.toString();
      if (qs) url += `?${qs}`;
    } else {
      fetchOptions.body = JSON.stringify(bodyParams);
    }

    const controller = new AbortController();
    const timeoutMs = timeout ?? this.config.timeout;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    fetchOptions.signal = controller.signal;

    try {
      return await fetch(url, fetchOptions);
    } finally {
      clearTimeout(timer);
    }
  }
}
