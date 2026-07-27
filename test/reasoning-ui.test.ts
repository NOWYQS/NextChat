import {
  normalizeReasoningEffort,
  REASONING_END_MARKER,
  REASONING_START_MARKER,
  splitReasoningContent,
} from "../app/utils/reasoning";

describe("reasoning effort", () => {
  test.each(["low", "medium", "high", "xhigh", "max"])(
    "accepts %s",
    (effort) => {
      expect(normalizeReasoningEffort(effort)).toBe(effort);
    },
  );

  test("falls back to medium for invalid stored values", () => {
    expect(normalizeReasoningEffort("invalid")).toBe("medium");
    expect(normalizeReasoningEffort("")).toBe("medium");
  });
});

describe("splitReasoningContent", () => {
  test("keeps a normal answer unchanged", () => {
    expect(splitReasoningContent("final answer")).toEqual({
      reasoning: "",
      answer: "final answer",
      hasReasoning: false,
      hasAnswer: true,
    });
  });

  test("parses an in-progress reasoning stream", () => {
    expect(
      splitReasoningContent(`${REASONING_START_MARKER}\nstep one\nstep two`),
    ).toEqual({
      reasoning: "step one\nstep two",
      answer: "",
      hasReasoning: true,
      hasAnswer: false,
    });
  });

  test("separates completed reasoning from the answer", () => {
    expect(
      splitReasoningContent(
        `${REASONING_START_MARKER}\nstep one\n${REASONING_END_MARKER}\nfinal answer`,
      ),
    ).toEqual({
      reasoning: "step one",
      answer: "final answer",
      hasReasoning: true,
      hasAnswer: true,
    });
  });

  test("supports legacy blockquote reasoning messages", () => {
    expect(splitReasoningContent("> old thought\n\nfinal answer")).toEqual({
      reasoning: "old thought",
      answer: "final answer",
      hasReasoning: true,
      hasAnswer: true,
    });
  });
});
