import {
  getMessageImages,
  getMessageTextContent,
  getMessageTextContentWithoutThinking,
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
  });

  test("does not crash when persisted content has an unknown object shape", () => {
    const malformedMessage = { ...legacyMessage, content: { value: "old" } };
    expect(getMessageTextContent(malformedMessage)).toBe("");
    expect(getMessageImages(malformedMessage)).toEqual([]);
  });
});
