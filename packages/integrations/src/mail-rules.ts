export type EmailClass = "approved" | "rejected" | "suspended" | "unknown";
export type MailPlatform = "shopee" | "facebook";

export interface MailMetadata {
  from: string;
  subject: string;
  /** ค่า Authentication-Results จาก Gmail ใช้ตรวจว่าผู้ส่งไม่ได้ถูกปลอม */
  authenticationResults: string;
}

export interface MailClassification {
  platform: MailPlatform | null;
  classification: EmailClass;
  /** true เมื่อมั่นใจพอให้ระบบเปลี่ยนสถานะเองได้ */
  confident: boolean;
  reason: string;
}

const SENDER_DOMAINS: Record<MailPlatform, string[]> = {
  shopee: ["shopee.co.th", "shopee.com"],
  facebook: ["facebookmail.com", "facebook.com", "meta.com"],
};

const CONTEXT: Record<MailPlatform, RegExp> = {
  shopee: /affiliate|แอฟฟิลิเอต|พันธมิตร/i,
  facebook: /\bpage\b|เพจ|เพจของคุณ/i,
};

// เรียงจากเฉพาะเจาะจงไปกว้าง เพราะ "not approved" มีคำว่า approved อยู่ด้วย
const PATTERNS: Array<{ classification: Exclude<EmailClass, "unknown">; pattern: RegExp }> = [
  { classification: "rejected", pattern: /not approved|rejected|declined|unsuccessful|ไม่ผ่าน|ไม่อนุมัติ|ปฏิเสธ/i },
  { classification: "suspended", pattern: /suspended|restricted|disabled|banned|ระงับ|ถูกจำกัด|ปิดใช้งาน/i },
  { classification: "approved", pattern: /approved|accepted|congratulations|อนุมัติ|ผ่านการ|ยินดีด้วย/i },
];

export function senderDomain(from: string): string | null {
  const address = from.match(/<([^>]+)>/)?.[1] ?? from;
  const domain = address.trim().toLowerCase().split("@").pop();
  return domain && domain.includes(".") ? domain : null;
}

function platformOf(domain: string | null): MailPlatform | null {
  if (!domain) return null;
  for (const [platform, domains] of Object.entries(SENDER_DOMAINS) as Array<[MailPlatform, string[]]>) {
    if (domains.some((allowed) => domain === allowed || domain.endsWith(`.${allowed}`))) return platform;
  }
  return null;
}

/** ตรวจว่า DMARC หรือ DKIM ผ่านด้วยโดเมนเดียวกับผู้ส่ง */
export function isAuthenticated(authenticationResults: string, domain: string): boolean {
  // DMARC ต้องผ่านด้วยโดเมนเดียวกับที่แสดงใน From
  const dmarcDomain = authenticationResults.match(/\bdmarc=pass\b[^;]*?header\.from=([a-z0-9.-]+)/i)?.[1]?.toLowerCase();
  if (dmarcDomain === domain) return true;
  const dkimDomain = authenticationResults.match(/\bdkim=pass\b[^;]*?header\.(?:i=@|d=)([a-z0-9.-]+)/i)?.[1]?.toLowerCase();
  return Boolean(dkimDomain && (dkimDomain === domain || domain.endsWith(`.${dkimDomain}`)));
}

export function classifyMail(mail: MailMetadata): MailClassification {
  const domain = senderDomain(mail.from);
  const platform = platformOf(domain);
  if (!platform) return { platform: null, classification: "unknown", confident: false, reason: "ไม่ใช่โดเมนที่รู้จัก" };

  const matches = PATTERNS.filter(({ pattern }) => pattern.test(mail.subject));
  const first = matches[0];
  if (!first) return { platform, classification: "unknown", confident: false, reason: "หัวข้อไม่ตรงกับกฎ" };
  const classification = first.classification;

  // "not approved" ตรงทั้ง rejected และ approved ซึ่งไม่ถือว่าขัดแย้ง
  const conflicting = matches.some(
    (match) => match.classification !== classification && !(classification === "rejected" && match.classification === "approved"),
  );
  if (conflicting) return { platform, classification, confident: false, reason: "หัวข้อมีความหมายขัดกัน" };
  if (!CONTEXT[platform].test(mail.subject)) {
    return { platform, classification, confident: false, reason: "หัวข้อไม่ได้พูดถึงบริการที่ติดตาม" };
  }
  if (!isAuthenticated(mail.authenticationResults, domain!)) {
    return { platform, classification, confident: false, reason: "ยืนยันผู้ส่งไม่ผ่าน" };
  }
  return { platform, classification, confident: true, reason: "ตรงกับกฎและยืนยันผู้ส่งผ่าน" };
}
