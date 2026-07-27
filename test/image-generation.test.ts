import {
  AUTO_IMAGE_MODEL,
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

  test.each([
    ["generate", "generate"],
    ["EDIT", "edit"],
    ["chat", "chat"],
    ["unexpected", "chat"],
  ] as const)("parses classifier result %s", (value, expected) => {
    expect(parseImageIntent(value)).toBe(expected);
  });
});
