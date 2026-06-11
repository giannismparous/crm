import { describe, expect, it } from "vitest";
import { parseMentionsFromText } from "./mentions";
import { makePerson } from "../../tests/helpers/fixtures";

describe("mentions", () => {
  const people = [
    makePerson({ id: "u1", name: "Alice Smith" }),
    makePerson({ id: "u2", name: "Bob" }),
  ];

  it("parses @person mentions", () => {
    const found = parseMentionsFromText("Hey @Alice Smith please review", people);
    expect(found).toEqual([{ kind: "person", id: "u1", label: "Alice Smith" }]);
  });

  it("parses @department mentions", () => {
    const found = parseMentionsFromText("Ping @Engineering", people);
    expect(found).toEqual([{ kind: "department", id: "Engineering", label: "Engineering" }]);
  });

  it("dedupes repeated mentions", () => {
    const found = parseMentionsFromText("@Bob and @Bob again", people);
    expect(found.filter((m) => m.id === "u2")).toHaveLength(1);
  });
});
