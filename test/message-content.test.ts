import {
  getMessageImages,
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
  isMessageContentEmpty,
} from "../app/utils";

describe("legacy message content safety", () => {
  const legacyMessage = {
    role: "assistant",
    content: null,
  } as any;

  test("does not crash when persisted content is null", () => {
    expect(getMessageTextContent(legacyMessage)).toBe("");
    expect(getMessageTextContentWithoutThinking(legacyMessage)).toBe("");
    expect(getMessageImages(legacyMessage)).toEqual([]);
    expect(isMessageContentEmpty(legacyMessage)).toBe(true);
  });

  test("does not crash when persisted content has an unknown object shape", () => {
    const malformedMessage = { ...legacyMessage, content: { value: "old" } };
    expect(getMessageTextContent(malformedMessage)).toBe("");
    expect(getMessageImages(malformedMessage)).toEqual([]);
    expect(isMessageContentEmpty(malformedMessage)).toBe(true);
  });

  test("keeps valid text and multimodal content visible to the renderer", () => {
    expect(
      isMessageContentEmpty({ role: "assistant", content: "answer" } as any),
    ).toBe(false);
    expect(
      isMessageContentEmpty({
        role: "assistant",
        content: [{ type: "image_url", image_url: { url: "cache://image" } }],
      } as any),
    ).toBe(false);
    expect(
      isMessageContentEmpty({ role: "assistant", content: [] } as any),
    ).toBe(true);
  });
});
