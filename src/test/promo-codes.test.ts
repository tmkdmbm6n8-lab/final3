import { describe, it, expect } from "vitest";
import { promoInputSchema, promoIsAvailable, promoRemainingLabel, type PromoRow } from "@/lib/promo-codes";

const promo: PromoRow = {
  code: "TEST10", percent: 10, active: true, created_at: "2026-10-27T08:00:00Z",
  starts_at: null, ends_at: null, single_use: false, used_at: null,
};
const start = "2026-10-27T09:00:00Z";
const end = "2026-10-27T10:00:00Z";

describe("promo validity", () => {
  it("keeps permanent codes valid without an expiry", () => {
    expect(promoIsAvailable(promo, Date.parse("2030-01-01T00:00:00Z"))).toBe(true);
  });
  it("allows a dated code from the start until but not including the end", () => {
    const dated = { ...promo, starts_at: start, ends_at: end };
    expect(promoIsAvailable(dated, Date.parse(start) - 1)).toBe(false);
    expect(promoIsAvailable(dated, Date.parse(start))).toBe(true);
    expect(promoIsAvailable(dated, Date.parse(end) - 1)).toBe(true);
    expect(promoIsAvailable(dated, Date.parse(end))).toBe(false);
  });
  it("rejects a consumed single-use code", () => {
    expect(promoIsAvailable({ ...promo, single_use: true, used_at: start })).toBe(false);
    expect(promoIsAvailable({ ...promo, single_use: true })).toBe(true);
  });
  it("rejects incomplete or reversed date ranges", () => {
    expect(promoInputSchema.safeParse({ ...promo, starts_at: start }).success).toBe(false);
    expect(promoInputSchema.safeParse({ ...promo, starts_at: end, ends_at: start }).success).toBe(false);
  });
  it("updates the remaining duration each second and stops at zero", () => {
    expect(promoRemainingLabel(end, Date.parse(end) - 2000)).toBe("00:00:02");
    expect(promoRemainingLabel(end, Date.parse(end) - 1000)).toBe("00:00:01");
    expect(promoRemainingLabel(end, Date.parse(end) + 1000)).toBe("00:00:00");
  });
});