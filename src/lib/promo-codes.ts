import { z } from "zod";
import { codePattern, normalizeCode } from "./discounts";

export type PromoRow = {
  code: string;
  percent: number;
  active: boolean;
  created_at: string;
  starts_at: string | null;
  ends_at: string | null;
  single_use: boolean;
  used_at: string | null;
};

export const promoInputSchema = z.object({
  code: z.string().transform(normalizeCode).pipe(z.string().regex(codePattern)),
  percent: z.number().gt(0).max(100),
  active: z.boolean(),
  starts_at: z.string().datetime().nullable().default(null),
  ends_at: z.string().datetime().nullable().default(null),
  single_use: z.boolean().default(false),
}).superRefine((value, ctx) => {
  if ((value.starts_at === null) !== (value.ends_at === null)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "Renseignez les dates de début et de fin.", path: ["ends_at"] });
  }
  if (value.starts_at && value.ends_at && Date.parse(value.ends_at) <= Date.parse(value.starts_at)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "La fin doit être après le début.", path: ["ends_at"] });
  }
});

export function promoIsAvailable(promo: PromoRow | null, now = Date.now()): promo is PromoRow {
  if (!promo?.active) return false;
  if (promo.single_use && promo.used_at) return false;
  if (promo.starts_at && now < Date.parse(promo.starts_at)) return false;
  if (promo.ends_at && now >= Date.parse(promo.ends_at)) return false;
  return true;
}

export function promoRemainingLabel(endsAt: string, now = Date.now()) {
  const seconds = Math.max(0, Math.ceil((Date.parse(endsAt) - now) / 1000));
  const days = Math.floor(seconds / 86400);
  const clock = [Math.floor((seconds % 86400) / 3600), Math.floor((seconds % 3600) / 60), seconds % 60]
    .map(value => String(value).padStart(2, "0")).join(":");
  return days ? `${days} j ${clock}` : clock;
}