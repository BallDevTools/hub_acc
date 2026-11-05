const TIMEOUT_MS = 30_000;

const graphVersion = () => process.env.META_GRAPH_VERSION || "v26.0";
const graphUrl = (path: string) => `https://graph.facebook.com/${graphVersion()}${path}`;

export const META_SCOPES = ["pages_show_list", "pages_manage_posts", "pages_read_engagement", "read_insights"];

/**
 * - auth: token ใช้ไม่ได้ ต้องเชื่อมใหม่
 * - rate_limit: Meta ปฏิเสธก่อนทำงาน ลองใหม่ได้โดยไม่เสี่ยงโพสต์ซ้ำ
 * - rejected: เนื้อหาหรือสิทธิ์ไม่ผ่าน ลองซ้ำก็ไม่สำเร็จ
 * - ambiguous: ไม่รู้ว่าโพสต์ขึ้นหรือยัง ห้ามลองใหม่เอง
 */
export type MetaErrorKind = "auth" | "rate_limit" | "rejected" | "ambiguous";

export class MetaApiError extends Error {
  constructor(
    readonly kind: MetaErrorKind,
    message: string,
    readonly code?: number,
  ) {
    super(message);
  }
}

export function classifyMetaError(status: number, code: number | undefined): MetaErrorKind {
  if (status === 401 || code === 190 || code === 102) return "auth";
  if (status === 429 || (code !== undefined && [4, 17, 32, 613].includes(code))) return "rate_limit";
  if (status >= 500 || code === 1 || code === 2) return "ambiguous";
  return "rejected";
}

async function graph(path: string, init: { accessToken?: string; form?: Record<string, string> } = {}) {
  let response: Response;
  try {
    response = await fetch(graphUrl(path), {
      method: init.form ? "POST" : "GET",
      headers: {
        ...(init.accessToken ? { authorization: `Bearer ${init.accessToken}` } : {}),
        ...(init.form ? { "content-type": "application/x-www-form-urlencoded" } : {}),
      },
      body: init.form ? new URLSearchParams(init.form) : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (error) {
    // เครือข่ายขาดหรือ timeout: คำขออาจไปถึง Meta แล้ว
    throw new MetaApiError("ambiguous", error instanceof Error ? error.message : "Network error");
  }
  const data = (await response.json().catch(() => null)) as { error?: { code?: number; message?: string } } | null;
  if (!response.ok || data?.error) {
    const code = data?.error?.code;
    throw new MetaApiError(classifyMetaError(response.status, code), data?.error?.message ?? `Meta responded ${response.status}`, code);
  }
  if (!data) throw new MetaApiError("ambiguous", "Meta returned an unreadable response");
  return data as Record<string, unknown>;
}

export function buildMetaAuthUrl(input: { appId: string; redirectUri: string; state: string }): string {
  const url = new URL(`https://www.facebook.com/${graphVersion()}/dialog/oauth`);
  url.search = new URLSearchParams({
    client_id: input.appId,
    redirect_uri: input.redirectUri,
    state: input.state,
    response_type: "code",
    scope: META_SCOPES.join(","),
  }).toString();
  return url.toString();
}

export interface MetaPage {
  id: string;
  name: string;
  accessToken: string;
}

export interface MetaMetricValue {
  date: string;
  value: number;
}

export interface MetaClient {
  exchangeCode(
    app: { appId: string; appSecret: string },
    code: string,
    redirectUri: string,
  ): Promise<{ accessToken: string; expiresAt: Date | null }>;
  listPages(userToken: string): Promise<MetaPage[]>;
  publishPost(metaPageId: string, pageToken: string, post: { message: string; link?: string | null }): Promise<string>;
  pageMetric(metaPageId: string, pageToken: string, metric: string, since: Date, until: Date): Promise<MetaMetricValue[]>;
}

const seconds = (date: Date) => String(Math.floor(date.getTime() / 1000));

export const httpMetaClient: MetaClient = {
  async exchangeCode(app, code, redirectUri) {
    const short = await graph(
      `/oauth/access_token?${new URLSearchParams({
        client_id: app.appId,
        client_secret: app.appSecret,
        redirect_uri: redirectUri,
        code,
      })}`,
    );
    const long = await graph(
      `/oauth/access_token?${new URLSearchParams({
        grant_type: "fb_exchange_token",
        client_id: app.appId,
        client_secret: app.appSecret,
        fb_exchange_token: String(short.access_token),
      })}`,
    );
    const expiresIn = Number(long.expires_in);
    return {
      accessToken: String(long.access_token),
      expiresAt: Number.isFinite(expiresIn) && expiresIn > 0 ? new Date(Date.now() + expiresIn * 1000) : null,
    };
  },
  async listPages(userToken) {
    const pages: MetaPage[] = [];
    let path: string | null = "/me/accounts?fields=id,name,access_token&limit=100";
    while (path) {
      const data: Record<string, unknown> = await graph(path, { accessToken: userToken });
      for (const page of (data.data as Array<{ id: string; name: string; access_token: string }>) ?? []) {
        pages.push({ id: page.id, name: page.name, accessToken: page.access_token });
      }
      const after = (data.paging as { cursors?: { after?: string }; next?: string } | undefined);
      path = after?.next && after.cursors?.after ? `/me/accounts?fields=id,name,access_token&limit=100&after=${encodeURIComponent(after.cursors.after)}` : null;
    }
    return pages;
  },
  async publishPost(metaPageId, pageToken, post) {
    const data = await graph(`/${encodeURIComponent(metaPageId)}/feed`, {
      accessToken: pageToken,
      form: { message: post.message, ...(post.link ? { link: post.link } : {}) },
    });
    if (typeof data.id !== "string") throw new MetaApiError("ambiguous", "Meta did not return a post id");
    return data.id;
  },
  async pageMetric(metaPageId, pageToken, metric, since, until) {
    const data = await graph(
      `/${encodeURIComponent(metaPageId)}/insights/${encodeURIComponent(metric)}?${new URLSearchParams({
        period: "day",
        since: seconds(since),
        until: seconds(until),
      })}`,
      { accessToken: pageToken },
    );
    const series = (data.data as Array<{ values?: Array<{ value: unknown; end_time: string }> }> | undefined)?.[0];
    return (series?.values ?? [])
      .filter((item) => typeof item.value === "number")
      .map((item) => ({ date: item.end_time.slice(0, 10), value: item.value as number }));
  },
};
