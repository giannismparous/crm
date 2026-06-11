import { describe, expect, it } from "vitest";
import { healLegacyRateLimitError } from "./calendarStatus";

describe("calendarStatus", () => {
  it("clears legacy rate limit exceeded strings", () => {
    expect(healLegacyRateLimitError("Rate Limit Exceeded")).toBe("");
    expect(healLegacyRateLimitError("rate limit exceeded")).toBe("");
  });

  it("preserves other errors", () => {
    expect(healLegacyRateLimitError("Token expired")).toBe("Token expired");
    expect(healLegacyRateLimitError("")).toBe("");
  });
});
