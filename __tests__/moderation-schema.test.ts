import {
  REPORT_REASONS,
  reportStatusUpdateSchema,
  reportTaskSchema,
} from "../src/features/moderation/moderation.schema";

describe("moderation schema", () => {
  it.each([
    ["Harassment or bullying", "Harassment or bullying"],
    ["harassment", "Harassment or bullying"],
    ["harassment_bullying", "Harassment or bullying"],
    ["harassment_or_bullying", "Harassment or bullying"],
    ["bullying", "Harassment or bullying"],
    ["Hate or abusive content", "Hate or abusive content"],
    ["hate", "Hate or abusive content"],
    ["abuse", "Hate or abusive content"],
    ["abusive", "Hate or abusive content"],
    ["hate_abuse", "Hate or abusive content"],
    ["hate_or_abuse", "Hate or abusive content"],
    ["hate_abusive_content", "Hate or abusive content"],
    ["hate_or_abusive_content", "Hate or abusive content"],
    ["Sexual content", "Sexual content"],
    ["sexual", "Sexual content"],
    ["sexual_content", "Sexual content"],
    ["Scam or spam", "Scam or spam"],
    ["scam", "Scam or spam"],
    ["spam", "Scam or spam"],
    ["scam_spam", "Scam or spam"],
    ["scam_or_spam", "Scam or spam"],
    ["Self-harm or dangerous behavior", "Self-harm or dangerous behavior"],
    ["self_harm", "Self-harm or dangerous behavior"],
    ["self_harm_dangerous", "Self-harm or dangerous behavior"],
    ["self_harm_dangerous_behavior", "Self-harm or dangerous behavior"],
    ["dangerous_behavior", "Self-harm or dangerous behavior"],
    ["self_harm_or_dangerous_behavior", "Self-harm or dangerous behavior"],
    ["Other", "Other"],
    ["other", "Other"],
  ])("normalizes report reason %s", (reason, expected) => {
    expect(reportTaskSchema.parse({ reason }).reason).toBe(expected);
  });

  it.each(REPORT_REASONS)("accepts display label %s", (reason) => {
    expect(reportTaskSchema.parse({ reason }).reason).toBe(reason);
  });

  it("trims optional details and drops empty details", () => {
    expect(
      reportTaskSchema.parse({
        reason: "other",
        details: "  Something happened.  ",
      })
    ).toMatchObject({
      reason: "Other",
      details: "Something happened.",
    });

    expect(
      reportTaskSchema.parse({
        reason: "other",
        details: "   ",
      })
    ).toEqual({
      reason: "Other",
      details: undefined,
    });
  });

  it("rejects unknown report reasons", () => {
    expect(() =>
      reportTaskSchema.parse({ reason: "not_a_real_reason" })
    ).toThrow();
  });

  it.each(["pending", "reviewed", "dismissed", "action_taken"])(
    "accepts report status %s",
    (status) => {
      expect(reportStatusUpdateSchema.parse({ status }).status).toBe(status);
    }
  );
});
