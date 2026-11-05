const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API = "https://gmail.googleapis.com/gmail/v1/users/me";
const TIMEOUT_MS = 20_000;

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.readonly";

export class ReauthRequiredError extends Error {}

export interface GoogleCredentials {
  clientId: string;
  clientSecret: string;
}

export interface TokenSet {
  accessToken: string;
  refreshToken?: string;
  expiresAt: Date;
}

async function requestToken(params: Record<string, string>): Promise<TokenSet> {
  const response = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(params),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  const data = (await response.json().catch(() => ({}))) as Record<string, unknown>;
  if (!response.ok) {
    if (data.error === "invalid_grant") throw new ReauthRequiredError("Google revoked or expired the refresh token");
    throw new Error(`Google token request failed with ${response.status}`);
  }
  return {
    accessToken: String(data.access_token),
    refreshToken: typeof data.refresh_token === "string" ? data.refresh_token : undefined,
    expiresAt: new Date(Date.now() + Number(data.expires_in ?? 3600) * 1000),
  };
}

export function buildGmailAuthUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  loginHint: string;
}): string {
  const url = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: GMAIL_SCOPE,
    access_type: "offline",
    prompt: "consent",
    state: input.state,
    login_hint: input.loginHint,
  }).toString();
  return url.toString();
}

export const exchangeGmailCode = (credentials: GoogleCredentials, code: string, redirectUri: string) =>
  requestToken({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
  });

export const refreshGmailToken = (credentials: GoogleCredentials, refreshToken: string) =>
  requestToken({
    client_id: credentials.clientId,
    client_secret: credentials.clientSecret,
    refresh_token: refreshToken,
    grant_type: "refresh_token",
  });

export interface GmailMessage {
  id: string;
  receivedAt: Date;
  from: string;
  subject: string;
  authenticationResults: string;
}

export interface GmailClient {
  profileEmail(accessToken: string): Promise<string>;
  listMessageIds(accessToken: string, query: string): Promise<string[]>;
  getMessage(accessToken: string, id: string): Promise<GmailMessage>;
}

async function gmailGet(accessToken: string, path: string): Promise<Record<string, unknown>> {
  const response = await fetch(`${API}${path}`, {
    headers: { authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (response.status === 401) throw new ReauthRequiredError("Gmail rejected the access token");
  if (!response.ok) throw new Error(`Gmail request failed with ${response.status}`);
  return (await response.json()) as Record<string, unknown>;
}

export const httpGmailClient: GmailClient = {
  async profileEmail(accessToken) {
    const data = await gmailGet(accessToken, "/profile");
    return String(data.emailAddress).toLowerCase();
  },
  async listMessageIds(accessToken, query) {
    const data = await gmailGet(accessToken, `/messages?maxResults=50&q=${encodeURIComponent(query)}`);
    return ((data.messages as Array<{ id: string }> | undefined) ?? []).map((message) => message.id);
  },
  async getMessage(accessToken, id) {
    const headersQuery = ["From", "Subject", "Authentication-Results"].map((name) => `metadataHeaders=${name}`).join("&");
    const data = await gmailGet(accessToken, `/messages/${encodeURIComponent(id)}?format=metadata&${headersQuery}`);
    const headers = ((data.payload as { headers?: Array<{ name: string; value: string }> })?.headers ?? []);
    const header = (name: string) =>
      headers.filter((item) => item.name.toLowerCase() === name.toLowerCase()).map((item) => item.value).join("; ");
    return {
      id,
      receivedAt: new Date(Number(data.internalDate)),
      from: header("From"),
      subject: header("Subject"),
      authenticationResults: header("Authentication-Results"),
    };
  },
};
