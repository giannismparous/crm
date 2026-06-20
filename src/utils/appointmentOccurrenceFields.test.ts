import { describe, expect, it } from "vitest";
import type { Appointment } from "../types";
import {
  buildOccurrenceContentPatch,
  getOccurrenceDescription,
  getOccurrenceLocation,
  getOccurrenceMeetingLink,
  getOccurrenceReviewItems,
  occurrenceFieldsForCreate,
} from "./appointmentOccurrenceFields";

function baseApt(overrides: Partial<Appointment> = {}): Appointment {
  return {
    id: "a1",
    title: "Sync",
    startsAt: "2030-06-01T10:00:00.000Z",
    location: "HQ",
    meetingLink: "https://meet.example/a",
    description: "<p>Series agenda</p>",
    reviewItems: ["Budget"],
    participantIds: ["p1"],
    participantDepartmentIds: [],
    createdById: "creator",
    status: "scheduled",
    createdAt: "2030-01-01T00:00:00.000Z",
    recurrenceRule: { kind: "weekly", interval: 1 },
    recurrenceCount: 4,
    ...overrides,
  };
}

describe("appointmentOccurrenceFields", () => {
  it("prefills location, link, and description from series defaults on every occurrence", () => {
    const apt = baseApt();
    expect(getOccurrenceLocation(apt, 0)).toBe("HQ");
    expect(getOccurrenceLocation(apt, 2)).toBe("HQ");
    expect(getOccurrenceMeetingLink(apt, 2)).toBe("https://meet.example/a");
    expect(getOccurrenceDescription(apt, 2)).toBe("<p>Series agenda</p>");
    expect(getOccurrenceReviewItems(apt, 2)).toEqual([]);
    expect(getOccurrenceReviewItems(apt, 0)).toEqual(["Budget"]);
  });

  it("reads per-occurrence overrides", () => {
    const apt = baseApt({
      occurrenceFields: {
        "2": {
          location: "Room B",
          reviewItems: ["Contracts"],
          description: "<p>Week 3 only</p>",
          meetingLink: "https://meet.example/b",
        },
      },
    });
    expect(getOccurrenceLocation(apt, 2)).toBe("Room B");
    expect(getOccurrenceReviewItems(apt, 2)).toEqual(["Contracts"]);
    expect(getOccurrenceDescription(apt, 2)).toBe("<p>Week 3 only</p>");
    expect(getOccurrenceMeetingLink(apt, 2)).toBe("https://meet.example/b");
  });

  it("stores only first-occurrence review items on recurring create", () => {
    const occ0 = occurrenceFieldsForCreate(true, 0, { reviewItems: ["Deck"] });
    expect(occ0).toEqual({ reviewItems: ["Deck"] });
    expect(occurrenceFieldsForCreate(true, 1, { reviewItems: ["Deck"] })).toBeUndefined();
  });

  it("does not store overrides when values match series defaults", () => {
    const apt = baseApt();
    const patch = buildOccurrenceContentPatch(apt, 1, {
      location: "HQ",
      meetingLink: "https://meet.example/a",
      description: "<p>Series agenda</p>",
      reviewItems: [],
    });
    expect(patch.occurrenceFields).toEqual({});
  });

  it("stores overrides only for changed fields", () => {
    const apt = baseApt();
    const patch = buildOccurrenceContentPatch(apt, 1, {
      location: "Online",
      meetingLink: "https://meet.example/a",
      description: "<p>Series agenda</p>",
      reviewItems: ["Slides"],
    });
    expect(patch.occurrenceFields?.["1"]).toEqual({
      location: "Online",
      reviewItems: ["Slides"],
    });
  });
});
