import { existsSync, readFileSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { AnthropicProvider } from "./providers/anthropic.js";
import { OpenAIProvider } from "./providers/openai.js";
import type { VisionProvider } from "./providers/types.js";

/**
 * Load `.env` from this package's root regardless of the spawning process's
 * cwd. bun only auto-loads `.env` from cwd, which fails when an MCP client
 * (e.g. Claude Code) launches the server from another directory. Values
 * already present in process.env are preserved — explicit/inherited env wins.
 */
function loadPackageEnv(): void {
  const envPath = resolve(dirname(fileURLToPath(import.meta.url)), "..", ".env");
  if (!existsSync(envPath)) return;
  for (const raw of readFileSync(envPath, "utf8").split("\n")) {
    const line = raw.trim();
    if (!line || line.startsWith("#")) continue;
    const eq = line.indexOf("=");
    if (eq < 0) continue;
    const key = line.slice(0, eq).trim();
    let value = line.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (!(key in process.env)) process.env[key] = value;
  }
}
loadPackageEnv();

export type VisionProviderName = "anthropic" | "openai";

/**
 * Per-provider baked defaults. Lets the server run with ONLY `VISION_API_KEY`
 * set for providers whose defaults are known. `anthropic` has no baked
 * defaults — its baseURL/model are still required from env.
 */
const PROVIDER_DEFAULTS: Record<VisionProviderName, { baseURL?: string; model?: string }> = {
  anthropic: { baseURL: undefined, model: undefined }, // still required from env
  openai: { baseURL: "https://api.z.ai/api/coding/paas/v4", model: "glm-4.6v" },
};

export interface VisionConfig {
  provider: VisionProviderName;
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  thinking: "enabled" | "disabled";
}

/** Read an env var, treating empty string as absent. */
function env(key: string): string | undefined {
  const v = process.env[key];
  return v && v.trim().length > 0 ? v : undefined;
}

function parseInt32(raw: string | undefined, fallback: number, name: string): number {
  if (raw === undefined || raw.trim().length === 0) return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer, got: ${JSON.stringify(raw)}`);
  }
  return n;
}

/**
 * Load vision configuration from environment variables.
 *
 * Required vars depend on `VISION_PROVIDER`. If any required var for the
 * active provider is missing or empty, throws an Error naming the missing
 * var(s) and the active provider. Never logs the API key.
 */
export function loadConfig(): VisionConfig {
  const provider = (env("VISION_PROVIDER") ?? "openai") as VisionProviderName;
  if (provider !== "anthropic" && provider !== "openai") {
    throw new Error(
      `VISION_PROVIDER must be "anthropic" or "openai", got: ${JSON.stringify(provider)}`,
    );
  }

  // Provider-specific env names. `VISION_*` aliases take PRECEDENCE over the
  // provider-specific names so the server can be configured unambiguously even
  // in host environments that already export ANTHROPIC_* (e.g. a coding agent's
  // own credentials). Without this, inherited process env would shadow the
  // provider-specific vars (bun's .env does not override existing process env).
  const P =
    provider === "anthropic"
      ? { base: "ANTHROPIC_BASE_URL", key: "ANTHROPIC_API_KEY", model: "ANTHROPIC_MODEL" }
      : { base: "OPENAI_BASE_URL", key: "OPENAI_API_KEY", model: "OPENAI_MODEL" };

  const defaults = PROVIDER_DEFAULTS[provider];

  const baseURL = env("VISION_BASE_URL") ?? env(P.base) ?? defaults.baseURL;
  const apiKey = env("VISION_API_KEY") ?? env(P.key);
  const model = env("VISION_MODEL") ?? env(P.model) ?? defaults.model;

  const missing: string[] = [];
  if (!baseURL) missing.push(`VISION_BASE_URL (or ${P.base})`);
  if (!apiKey) missing.push(`VISION_API_KEY (or ${P.key})`);
  if (!model) missing.push(`VISION_MODEL (or ${P.model})`);

  if (missing.length > 0) {
    throw new Error(
      `Missing required environment variable(s) for provider "${provider}": ${missing.join(", ")}. ` +
        `Set these in your .env file.`,
    );
  }

  const maxTokens = parseInt32(env("VISION_MAX_TOKENS"), 1024, "VISION_MAX_TOKENS");
  const timeoutMs = parseInt32(env("VISION_TIMEOUT_MS"), 60000, "VISION_TIMEOUT_MS");

  const thinkingRaw = env("VISION_THINKING") ?? "disabled";
  if (thinkingRaw !== "enabled" && thinkingRaw !== "disabled") {
    throw new Error(
      `VISION_THINKING must be "enabled" or "disabled", got: ${JSON.stringify(thinkingRaw)}`,
    );
  }
  const thinking = thinkingRaw;

  return {
    provider,
    baseURL: baseURL!,
    apiKey: apiKey!,
    model: model!,
    maxTokens,
    timeoutMs,
    thinking,
  };
}

/** Construct the concrete provider implementation for a config. */
export function createProvider(cfg: VisionConfig): VisionProvider {
  if (cfg.provider === "anthropic") {
    return new AnthropicProvider({
      baseURL: cfg.baseURL,
      apiKey: cfg.apiKey,
      model: cfg.model,
      maxTokens: cfg.maxTokens,
      timeoutMs: cfg.timeoutMs,
    });
  }
  return new OpenAIProvider({
    baseURL: cfg.baseURL,
    apiKey: cfg.apiKey,
    model: cfg.model,
    maxTokens: cfg.maxTokens,
    timeoutMs: cfg.timeoutMs,
    thinking: cfg.thinking,
  });
}
