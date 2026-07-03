import Anthropic from "@anthropic-ai/sdk";
import type { Anthropic as AnthropicTypes } from "@anthropic-ai/sdk";
import type { LoadedImage, VisionProvider } from "./types.js";

export interface AnthropicProviderOptions {
  baseURL: string;
  apiKey: string;
  model: string;
  maxTokens: number;
  timeoutMs: number;
}

/**
 * Vision provider that talks the Anthropic Messages API format using the
 * official `@anthropic-ai/sdk`. Works against api.anthropic.com or any
 * Anthropic-format gateway (e.g. opencode zen `/zen/go`).
 */
export class AnthropicProvider implements VisionProvider {
  private readonly client: Anthropic;
  private readonly model: string;
  private readonly maxTokens: number;

  constructor(opts: AnthropicProviderOptions) {
    this.client = new Anthropic({
      baseURL: opts.baseURL,
      apiKey: opts.apiKey,
      timeout: opts.timeoutMs,
    });
    this.model = opts.model;
    this.maxTokens = opts.maxTokens;
  }

  async analyze(images: LoadedImage[], prompt: string): Promise<string> {
    // Build the content array. The SDK's content field is a discriminated
    // union; typing it as ContentBlockParam[] keeps each block assignable
    // without per-block casts.
    const content: AnthropicTypes.ContentBlockParam[] = [
      ...images.map(
        (img): AnthropicTypes.ImageBlockParam => ({
          type: "image",
          source: {
            type: "base64",
            // SDK requires a literal MIME union; our loader's type is a broad string.
            media_type: img.media_type as "image/jpeg" | "image/png" | "image/gif" | "image/webp",
            data: img.data,
          },
        }),
      ),
      { type: "text", text: prompt },
    ];

    const response = await this.client.messages.create({
      model: this.model,
      max_tokens: this.maxTokens,
      messages: [{ role: "user", content }],
    });

    // `content` is an array of output blocks (text, tool_use, ...).
    // Join the text blocks to form the final string.
    const text = response.content
      .filter((block): block is AnthropicTypes.TextBlock => block.type === "text")
      .map((block) => block.text)
      .join("");

    return text;
  }
}
