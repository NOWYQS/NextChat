export const REASONING_START_MARKER = "<!--nextchat-reasoning-start-->";
export const REASONING_END_MARKER = "<!--nextchat-reasoning-end-->";

export const REASONING_EFFORTS = [
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
] as const;

export type ReasoningEffort = (typeof REASONING_EFFORTS)[number];

export function normalizeReasoningEffort(value: string): ReasoningEffort {
  return REASONING_EFFORTS.includes(value as ReasoningEffort)
    ? (value as ReasoningEffort)
    : "medium";
}

export type ReasoningParts = {
  reasoning: string;
  answer: string;
  hasReasoning: boolean;
  hasAnswer: boolean;
};

function result(reasoning: string, answer: string): ReasoningParts {
  const normalizedReasoning = reasoning.trim();
  const normalizedAnswer = answer.trim();
  return {
    reasoning: normalizedReasoning,
    answer: normalizedAnswer,
    hasReasoning: normalizedReasoning.length > 0,
    hasAnswer: normalizedAnswer.length > 0,
  };
}

function stripLegacyQuote(content: string): string {
  return content
    .split("\n")
    .map((line) => line.replace(/^>\s?/, ""))
    .join("\n")
    .trim();
}

export function splitReasoningContent(content: string): ReasoningParts {
  const start = content.indexOf(REASONING_START_MARKER);
  if (start >= 0 && content.slice(0, start).trim().length === 0) {
    const reasoningStart = start + REASONING_START_MARKER.length;
    const end = content.indexOf(REASONING_END_MARKER, reasoningStart);
    if (end < 0) {
      return result(content.slice(reasoningStart), "");
    }
    return result(
      content.slice(reasoningStart, end),
      content.slice(end + REASONING_END_MARKER.length),
    );
  }

  // Backward compatibility for messages generated before the dedicated
  // reasoning markers were introduced. Legacy streams stored reasoning as a
  // leading Markdown blockquote, followed by a blank line and the answer.
  if (content.startsWith("> ")) {
    const boundary = content.search(/\n[ \t]*\n(?![ \t]*>[ \t]?)/);
    if (boundary < 0) {
      return result(stripLegacyQuote(content), "");
    }
    return result(
      stripLegacyQuote(content.slice(0, boundary)),
      content.slice(boundary),
    );
  }

  return result("", content);
}
