export const AUTO_IMAGE_MODEL = "gpt-image-2";

export type AutoImageResolution = "1k" | "2k" | "4k";
export type AutoImageSizeMode = "auto" | "preset" | "custom";
export type AutoImageAspectRatio =
  | "1:1"
  | "16:9"
  | "9:16"
  | "3:2"
  | "2:3"
  | "custom";

export const DEFAULT_AUTO_IMAGE_RESOLUTION: AutoImageResolution = "2k";
export const DEFAULT_AUTO_IMAGE_SIZE_MODE: AutoImageSizeMode = "preset";
export const DEFAULT_AUTO_IMAGE_ASPECT_RATIO: AutoImageAspectRatio = "16:9";

const AUTO_IMAGE_RESOLUTION_LONG_EDGE: Record<AutoImageResolution, number> = {
  "1k": 1024,
  "2k": 2048,
  "4k": 4096,
};

const AUTO_IMAGE_ASPECT_RATIOS: Record<
  Exclude<AutoImageAspectRatio, "custom">,
  readonly [number, number]
> = {
  "1:1": [1, 1],
  "16:9": [16, 9],
  "9:16": [9, 16],
  "3:2": [3, 2],
  "2:3": [2, 3],
};

export interface AutoImageSizeConfig {
  imageSizeMode?: string;
  imageResolution?: string;
  imageAspectRatio?: string;
  imageCustomAspectWidth?: number;
  imageCustomAspectHeight?: number;
  imageCustomWidth?: number;
  imageCustomHeight?: number;
}

function positiveInteger(value: unknown): number | undefined {
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || numeric <= 0) return undefined;
  return Math.round(numeric);
}

function toSize(width: number, height: number): string {
  return `${width}x${height}`;
}

/**
 * Returns undefined for automatic mode so the API receives no `size` parameter.
 * Manual tiers retain a stable long edge while applying the chosen aspect ratio.
 */
export function getAutoImageSize(config?: AutoImageSizeConfig): string | undefined {
  const mode = config?.imageSizeMode ?? DEFAULT_AUTO_IMAGE_SIZE_MODE;
  if (mode === "auto") return undefined;

  if (mode === "custom") {
    const width = positiveInteger(config?.imageCustomWidth);
    const height = positiveInteger(config?.imageCustomHeight);
    return width && height ? toSize(width, height) : undefined;
  }

  const resolution =
    (config?.imageResolution as AutoImageResolution) ??
    DEFAULT_AUTO_IMAGE_RESOLUTION;
  const longEdge =
    AUTO_IMAGE_RESOLUTION_LONG_EDGE[resolution] ??
    AUTO_IMAGE_RESOLUTION_LONG_EDGE[DEFAULT_AUTO_IMAGE_RESOLUTION];
  const aspectRatio =
    (config?.imageAspectRatio as AutoImageAspectRatio) ??
    DEFAULT_AUTO_IMAGE_ASPECT_RATIO;
  const presetAspectRatio =
    (aspectRatio === "custom"
      ? DEFAULT_AUTO_IMAGE_ASPECT_RATIO
      : aspectRatio) as Exclude<AutoImageAspectRatio, "custom">;
  const [ratioWidth, ratioHeight] =
    aspectRatio === "custom"
      ? [
          positiveInteger(config?.imageCustomAspectWidth) ?? 1,
          positiveInteger(config?.imageCustomAspectHeight) ?? 1,
        ]
      : AUTO_IMAGE_ASPECT_RATIOS[presetAspectRatio];

  if (ratioWidth >= ratioHeight) {
    return toSize(longEdge, Math.round((longEdge * ratioHeight) / ratioWidth));
  }
  return toSize(Math.round((longEdge * ratioWidth) / ratioHeight), longEdge);
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
