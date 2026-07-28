import { jest } from "@jest/globals";
import {
  AUTO_IMAGE_MODEL,
  createImageIntentAbortController,
  isAutoImageEditEndpointRequest,
  isAutoImageEndpointRequest,
  isImageIntentCandidate,
  parseImageIntent,
} from "../app/utils/image-generation";

describe("auto image generation intent gate", () => {
  test.each([
    "生成一张戴宇航头盔的橘猫",
    "帮我画一幅雨夜城市",
    "create an image of a lighthouse",
  ])("marks an explicit creation request as a candidate: %s", (input) => {
    expect(isImageIntentCandidate(input, false)).toBe(true);
  });

  test("uses an existing image only for plausible edit follow-ups", () => {
    expect(isImageIntentCandidate("把背景换成蓝色", true)).toBe(true);
    expect(isImageIntentCandidate("谢谢", true)).toBe(false);
  });

  test("does not send ordinary text chat to the classifier", () => {
    expect(isImageIntentCandidate("解释一下这段 TypeScript", false)).toBe(false);
  });

  test("allows the hidden image model only on image endpoints", () => {
    expect(
      isAutoImageEndpointRequest("v1/images/generations", AUTO_IMAGE_MODEL),
    ).toBe(true);
    expect(isAutoImageEndpointRequest("v1/images/edits", AUTO_IMAGE_MODEL)).toBe(
      true,
    );
    expect(
      isAutoImageEndpointRequest("v1/chat/completions", AUTO_IMAGE_MODEL),
    ).toBe(false);
    expect(
      isAutoImageEndpointRequest("v1/images/generations", "gpt-5.6-terra"),
    ).toBe(false);
  });

  test("allows multipart edits only for the exact hidden image model", () => {
    expect(
      isAutoImageEditEndpointRequest("v1/images/edits", AUTO_IMAGE_MODEL),
    ).toBe(true);
    expect(
      isAutoImageEditEndpointRequest("v1/images/generations", AUTO_IMAGE_MODEL),
    ).toBe(false);
    expect(isAutoImageEditEndpointRequest("v1/images/edits", "other-model")).toBe(
      false,
    );
    expect(isAutoImageEditEndpointRequest("v1/images/edits", null)).toBe(false);
  });

  test.each([
    ["generate", "generate"],
    ["EDIT", "edit"],
    ["chat", "chat"],
    ["unexpected", "chat"],
  ] as const)("parses classifier result %s", (value, expected) => {
    expect(parseImageIntent(value)).toBe(expected);
  });

  test("cancels intent classification with the parent request", () => {
    jest.useFakeTimers();
    const parent = new AbortController();
    const request = createImageIntentAbortController(parent.signal, 15_000);

    parent.abort();
    expect(request.signal.aborted).toBe(true);

    request.cleanup();
    jest.useRealTimers();
  });

  test("times out intent classification and clears unused timers", () => {
    jest.useFakeTimers();
    const timedOut = createImageIntentAbortController(undefined, 15_000);
    jest.advanceTimersByTime(14_999);
    expect(timedOut.signal.aborted).toBe(false);
    jest.advanceTimersByTime(1);
    expect(timedOut.signal.aborted).toBe(true);
    timedOut.cleanup();

    const cleaned = createImageIntentAbortController(undefined, 15_000);
    cleaned.cleanup();
    jest.advanceTimersByTime(15_000);
    expect(cleaned.signal.aborted).toBe(false);
    jest.useRealTimers();
  });
});
