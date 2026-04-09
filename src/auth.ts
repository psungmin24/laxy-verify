/**
 * CLI authentication helpers for laxy-verify.
 *
 * Credentials are stored at ~/.laxy/credentials.json.
 * The CLI exchanges email/password for a short-lived verification token
 * through POST /api/cli-auth on the Laxy website.
 */
import * as fs from "node:fs";
import * as path from "node:path";
import * as os from "node:os";

const CREDENTIALS_DIR = path.join(os.homedir(), ".laxy");
const CREDENTIALS_PATH = path.join(CREDENTIALS_DIR, "credentials.json");

export const LAXY_API_URL =
  process.env.LAXY_API_URL ?? "https://laxy-blue.vercel.app";

interface Credentials {
  token: string;
  email: string;
  saved_at: string;
  expires_at: string;
}

export function loadToken(): string | null {
  const envToken = process.env.LAXY_TOKEN;
  if (envToken) return envToken;

  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) return null;
    const raw = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
    const creds = JSON.parse(raw) as Credentials;
    if (!creds.token) return null;

    if (creds.expires_at) {
      const expiresAt = new Date(creds.expires_at).getTime();
      if (expiresAt < Date.now()) {
        console.error("  Saved CLI token expired. Run `laxy-verify login` again.");
        return null;
      }
    }

    return creds.token;
  } catch {
    return null;
  }
}

export function saveToken(token: string, email: string, expiresInSec: number): void {
  if (!fs.existsSync(CREDENTIALS_DIR)) {
    fs.mkdirSync(CREDENTIALS_DIR, { recursive: true });
  }

  const creds: Credentials = {
    token,
    email,
    saved_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + expiresInSec * 1000).toISOString(),
  };

  fs.writeFileSync(CREDENTIALS_PATH, JSON.stringify(creds, null, 2), {
    encoding: "utf-8",
    mode: 0o600,
  });
}

export function clearToken(): void {
  if (fs.existsSync(CREDENTIALS_PATH)) {
    fs.rmSync(CREDENTIALS_PATH);
    console.log("  Saved CLI credentials removed.");
  } else {
    console.log("  No saved CLI credentials were found.");
  }
}

export function whoami(): void {
  const envToken = process.env.LAXY_TOKEN;
  if (envToken) {
    console.log("  Auth source: LAXY_TOKEN environment variable");
    return;
  }

  try {
    if (!fs.existsSync(CREDENTIALS_PATH)) {
      console.log("  Not logged in. Run `laxy-verify login` first.");
      return;
    }

    const raw = fs.readFileSync(CREDENTIALS_PATH, "utf-8");
    const creds = JSON.parse(raw) as Credentials;
    const expDate = creds.expires_at
      ? new Date(creds.expires_at).toLocaleDateString("ko-KR")
      : "unknown";

    console.log(`  Email: ${creds.email}`);
    console.log(`  Token expires: ${expDate}`);
  } catch {
    console.log("  Saved CLI credentials could not be read.");
  }
}

/**
 * Read a line from stdin without creating a readline interface.
 * This avoids the Windows UV_HANDLE_CLOSING assertion that can happen
 * when the process exits immediately after async stdin cleanup.
 */
function readLineSync(prompt: string, muted = false): string {
  process.stdout.write(prompt);
  const chars: number[] = [];
  const oneByte = Buffer.alloc(1);

  try {
    while (true) {
      const n = fs.readSync(0, oneByte, 0, 1, null);
      if (n === 0) break;

      const ch = oneByte[0];
      if (ch === 10) {
        if (muted) process.stdout.write("\n");
        break;
      }

      if (ch !== 13) chars.push(ch);
    }
  } catch {
    // Ignore stdin read errors and return the current buffer.
  }

  return Buffer.from(chars).toString("utf-8");
}

export async function login(emailArg?: string): Promise<void> {
  const email = emailArg?.trim() ?? readLineSync("  Email: ");
  const password = readLineSync("  Password: ", true);

  console.log("\n  Logging in...");

  let res: Response;
  try {
    res = await fetch(`${LAXY_API_URL}/api/cli-auth`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password }),
    });
  } catch {
    console.error(`  Could not reach ${LAXY_API_URL}.`);
    process.exit(1);
  }

  const contentType = res.headers.get("content-type") ?? "";
  if (!contentType.includes("application/json")) {
    const body = await res.text();
    const preview = body.slice(0, 200).replace(/\n/g, " ");
    console.error(`  The CLI auth endpoint returned non-JSON content. (HTTP ${res.status})`);
    console.error(`  URL: ${LAXY_API_URL}/api/cli-auth`);
    console.error(`  Response preview: ${preview}`);
    console.error("  Check the deployed auth route and required server env vars.");
    process.exit(1);
  }

  const data = (await res.json()) as { token?: string; expires_in?: number; error?: string };

  if (!res.ok || !data.token) {
    console.error(`  ${data.error ?? "Login failed."}`);
    process.exit(1);
  }

  saveToken(data.token, email, data.expires_in ?? 30 * 24 * 60 * 60);
  console.log("  Login succeeded. Run `laxy-verify .` to start verification.");
}
