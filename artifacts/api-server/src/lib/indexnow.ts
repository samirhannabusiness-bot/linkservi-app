import { randomBytes } from "crypto";

const INDEXNOW_KEY = process.env.INDEXNOW_KEY ?? randomBytes(16).toString("hex");
const HOST = "linkservi.com";

export function getIndexNowKey(): string {
  return INDEXNOW_KEY;
}

export async function pingIndexNow(urls: string[]): Promise<void> {
  if (!urls.length) return;
  try {
    const body = {
      host: HOST,
      key: INDEXNOW_KEY,
      keyLocation: `https://${HOST}/api/${INDEXNOW_KEY}.txt`,
      urlList: urls,
    };
    await fetch("https://api.indexnow.org/IndexNow", {
      method: "POST",
      headers: { "Content-Type": "application/json; charset=utf-8" },
      body: JSON.stringify(body),
    }).catch((err) => console.warn("[IndexNow] ping failed:", err?.message));
  } catch (err) {
    console.warn("[IndexNow] error:", err);
  }
}
