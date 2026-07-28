export const AUTO_IMAGE_MODEL = "gpt-image-2";
export const IMAGE_INTENT_TIMEOUT_MS = 15_000;

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

/** Multipart image edits are the only non-JSON hidden-model request. */
export function isAutoImageEditEndpointRequest(
  path: string,
  model: unknown,
): boolean {
  return (
    path === "v1/images/edits" &&
    typeof model === "string" &&
    model === AUTO_IMAGE_MODEL
  );
}

export function createImageIntentAbortController(
  parentSignal?: AbortSignal,
  timeoutMs = IMAGE_INTENT_TIMEOUT_MS,
) {
  const controller = new AbortController();
  const abort = () => controller.abort();

  if (parentSignal?.aborted) {
    abort();
  } else {
    parentSignal?.addEventListener("abort", abort, { once: true });
  }

  const timeoutId = setTimeout(abort, timeoutMs);

  return {
    signal: controller.signal,
    cleanup() {
      clearTimeout(timeoutId);
      parentSignal?.removeEventListener("abort", abort);
    },
  };
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
