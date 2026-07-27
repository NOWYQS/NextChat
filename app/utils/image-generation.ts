export const AUTO_IMAGE_MODEL = "gpt-image-2";
export type AutoImageResolution = "1k" | "2k" | "4k";

export const DEFAULT_AUTO_IMAGE_RESOLUTION: AutoImageResolution = "2k";

// gpt-image-2 accepts explicit pixel dimensions. Keep the UI compact while
// preserving a single, predictable 16:9 landscape output for each tier.
const AUTO_IMAGE_RESOLUTION_SIZES: Record<AutoImageResolution, string> = {
  "1k": "1024x576",
  "2k": "2048x1152",
  "4k": "4096x2304",
};

export function getAutoImageSize(resolution?: string): string {
  return (
    AUTO_IMAGE_RESOLUTION_SIZES[resolution as AutoImageResolution] ??
    AUTO_IMAGE_RESOLUTION_SIZES[DEFAULT_AUTO_IMAGE_RESOLUTION]
  );
}

/**
 * gpt-image-2 is deliberately omitted from the visible model allowlist.
 * Permit it server-side only for the two image endpoints used by the client.
 */
export function isAutoImageEndpointRequest(path: string, model?: string) {
  return (
    model === AUTO_IMAGE_MODEL &&
    (path === "v1/images/generations" || path === "v1/images/edits")
  );
}

export type ImageIntent = "generate" | "edit" | "chat";

const IMAGE_LANGUAGE =
  /(?:生成|生图|画(?:一|个|张|幅|出)?|绘(?:制|画)?|创作|制作(?:一张|图片|图像)?|设计(?:一张|图片|图像)?|渲染|改图|修图|重绘|换(?:个|成|为).*(?:背景|颜色|风格|衣服|姿势)|做(?:一张|个).*(?:图|图片|海报)|generate|create|draw|paint|render|illustrate|make\s+(?:an?\s+)?image|edit\s+(?:the\s+)?image|modify\s+(?:the\s+)?image|change\s+(?:the\s+)?(?:image|background|color|style))/i;

const IMAGE_EDIT_FOLLOWUP =
  /(?:把|改|换|变|调|加|删|去掉|保留|更|再|继续|背景|颜色|风格|衣服|姿势|亮|暗|清晰|放大|缩小|edit|modify|change|make\s+it|more|less|remove|add|keep)/i;

/**
 * Avoid charging a classifier request for ordinary chat. The final decision is
 * still made by the model; this only narrows the requests that need a semantic
 * intent check. A generated image in context is also a candidate for a terse
 * follow-up such as "把背景换成蓝色".
 */
export function isImageIntentCandidate(
  latestUserText: string,
  hasSourceImage: boolean,
): boolean {
  const text = latestUserText.trim();
  if (!text) return false;
  return (
    IMAGE_LANGUAGE.test(text) ||
    (hasSourceImage && IMAGE_EDIT_FOLLOWUP.test(text))
  );
}

export function parseImageIntent(value: unknown): ImageIntent {
  const normalized = String(value ?? "")
    .trim()
    .toLowerCase();
  if (normalized.includes("edit")) return "edit";
  if (normalized.includes("generate")) return "generate";
  return "chat";
}
