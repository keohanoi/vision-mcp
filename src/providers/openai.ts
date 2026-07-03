import type { LoadedImage, VisionProvider } from "./types.js";

export interface OpenAIProviderOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
  thinking: "enabled" | "disabled";
}

/** A single content part in an OpenAI chat message (text or image_url). */
interface OpenAIContentPart {
  type: string;
  text?: string;
  image_url?: { url: string };
}

/** Shape of the OpenAI chat-completions response we consume. */
interface OpenAIChatResponse {
  choices?: Array<{
    message?: { content?: string | OpenAIContentPart[] | null };
  }>;
}

/**
 * Vision provider that talks the OpenAI Chat Completions format using plain
 * `fetch` (no OpenAI SDK). Works against any OpenAI-compatible endpoint,
 * including opencode zen `/zen/v1`.
 */
export class OpenAIProvider implements VisionProvider {
  private readonly baseURL: string;
  private readonly apiKey: string;
  private readonly model: string;
  private readonly maxTokens: number;
  private readonly timeoutMs: number;
  private readonly thinking: "enabled" | "disabled";

  constructor(opts: OpenAIProviderOptions) {
    this.baseURL = opts.baseURL.replace(/\/+$/, ""); // strip trailing slash(es)
    this.apiKey = opts.apiKey;
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
    this.timeoutMs = opts.timeoutMs;
    this.thinking = opts.thinking;
  }

  async analyze(images: LoadedImage[], prompt: string): Promise<string> {
    const content: OpenAIContentPart[] = [
      ...images.map((img) => ({
        type: "image_url",
        image_url: { url: `data:${img.media_type};base64,${img.data}` },
      })),
      { type: "text", text: prompt },
    ];

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.timeoutMs);

    let res: Response;
    try {
      res = await fetch(`${this.baseURL}/chat/completions`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model: this.model,
          max_tokens: this.maxTokens,
          messages: [{ role: "user", content }],
          thinking: { type: this.thinking },
        }),
        signal: controller.signal,
      });
    } catch (err) {
      if (err instanceof Error && err.name === "AbortError") {
        throw new Error(`OpenAI request timed out after ${this.timeoutMs}ms`);
      }
      throw err;
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      const body = await res.text();
      const truncated = body.slice(0, 500);
      // Intentionally do NOT include the API key or Authorization header.
      throw new Error(
        `OpenAI request failed: HTTP ${res.status} ${res.statusText} — ${truncated}`,
      );
    }

    const json = (await res.json()) as OpenAIChatResponse;
    const raw = json.choices?.[0]?.message?.content ?? "";

    if (typeof raw === "string") return raw;
    // Some providers return content as an array of parts.
    return raw
      .filter((part) => part.type === "text" && typeof part.text === "string")
      .map((part) => part.text ?? "")
      .join("");
  }
}
