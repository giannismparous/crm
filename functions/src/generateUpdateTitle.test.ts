import { describe, expect, it } from "vitest";
import {
  fallbackTitle,
  isTitleGroundedInUpdate,
  isUnnaturalTitle,
} from "./generateUpdateTitle";

describe("generateUpdateTitle", () => {
  it("fallbackTitle uses at most 6 words (MAX_WORDS)", () => {
    const body = "one two three four five six seven eight nine ten";
    const title = fallbackTitle(body);
    expect(title.split(/\s+/).length).toBeLessThanOrEqual(6);
  });

  it("fallbackTitle handles empty body", () => {
    expect(fallbackTitle("")).toBe("Media update");
  });

  it("isTitleGroundedInUpdate accepts substring overlap", () => {
    expect(isTitleGroundedInUpdate("Shipped fix", "We shipped fix for login")).toBe(true);
  });

  it("isUnnaturalTitle rejects comma-heavy titles", () => {
    expect(isUnnaturalTitle("one, two, three, four, five", "body text")).toBe(true);
  });
});
