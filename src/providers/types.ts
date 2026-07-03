/**
 * Shared types for vision providers.
 */

/**
 * A decoded image ready to send to a vision model.
 *
 * `data` is the raw base64 payload with NO `data:` URI prefix.
 * `media_type` is the MIME type, e.g. "image/png".
 */
export interface LoadedImage {
  data: string;
  media_type: string;
}

/**
 * A backend that accepts one or more images plus a prompt and returns text.
 * Two implementations exist: Anthropic (SDK) and OpenAI-compatible (fetch).
 */
export interface VisionProvider {
  analyze(images: LoadedImage[], prompt: string): Promise<string>;
}

/** Options accepted by {@link loadImage}. */
export interface LoadImageOptions {
  /** Fallback MIME type when one can't be inferred. */
  mediaType?: string;
}
