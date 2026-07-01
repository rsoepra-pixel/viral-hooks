import { scryptSync } from "node:crypto";

export interface Config {
  port: number;
  sessionSecret: string;
  passwordHash: string | null;
  anthropicKey: string | null;
  model: string;
  redact: boolean;
  dataDir: string;
  retentionDays: number;
  isProd: boolean;
  /** Master switch for the optional, higher-risk live WhatsApp link. OFF by default. */
  enableLive: boolean;
}

/** scrypt hash "salt:hex" — used for the single-user password. */
export function hashPassword(password: string, salt = "wa-analyzer-salt"): string {
  const derived = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${derived}`;
}

export function loadConfig(): Config {
  const env = process.env;
  let passwordHash = env.APP_PASSWORD_HASH?.trim() || null;
  // Dev convenience: derive a hash from a plaintext password if provided.
  if (!passwordHash && env.APP_PASSWORD) {
    passwordHash = hashPassword(env.APP_PASSWORD);
  }
  return {
    port: Number(env.PORT ?? 8787),
    sessionSecret: env.SESSION_SECRET ?? "insecure-dev-secret-change-me",
    passwordHash,
    anthropicKey: env.ANTHROPIC_API_KEY?.trim() || null,
    model: env.ANTHROPIC_MODEL?.trim() || "claude-sonnet-5",
    redact: (env.REDACT_BEFORE_LLM ?? "true") !== "false",
    dataDir: env.DATA_DIR?.trim() || "./data",
    retentionDays: Number(env.RETENTION_DAYS ?? 0),
    isProd: env.NODE_ENV === "production",
    enableLive: (env.ENABLE_LIVE ?? "false") === "true",
  };
}
