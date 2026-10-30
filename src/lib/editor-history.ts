import { z } from "zod";

export const HIDEABLE = "h1, h2, h3, h4, p, span, a, button, img, section, article, li, header, footer";

export function hideKey(el: HTMLElement | Element): string | null {
  if (el instanceof HTMLImageElement && el.src) {
    try {
      const u = new URL(el.src, window.location.origin);
      return `img:${u.pathname}`;
    } catch {
      return `img:${el.src.slice(0, 100)}`;
    }
  }

  const btn = el.closest("a, button");
  if (btn) {
    const text = (btn.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 60);
    const target =
      btn instanceof HTMLAnchorElement ? (btn.getAttribute("href") ?? "") : (btn.getAttribute("data-action") ?? "btn");
    if (text || target) return `btn:${text}|${target}`;
  }

  const tag = el.tagName.toLowerCase();
  const text = (el.textContent ?? "").trim().replace(/\s+/g, " ").slice(0, 80);
  if (text) return `${tag}:${text}`;

  return null;
}

export function parseInfo(entry: string): { label?: string; page?: string; at?: string } {
  try {
    const obj = JSON.parse(entry);
    if (obj && typeof obj === "object") return obj;
  } catch {
    // legacy format
  }
  return { label: entry };
}

export const editFields = [
  "content",
  "images",
  "links",
  "hidden",
  "audience",
  "typography",
  "themeColors",
  "elementColors",
  "media",
  "disabledPages",
  "permanentlyDeletedPages",
] as const;

export const historyEntrySchema = z.object({
  id: z.string().uuid(),
  label: z.string().max(300),
  at: z.string(),
  state: z.record(z.string(), z.unknown()),
});

export const editHistorySchema = z.array(historyEntrySchema).max(100);
export type HistoryEntry = z.infer<typeof historyEntrySchema>;

export function historyBefore(history: HistoryEntry[], id: string) {
  const index = history.findIndex((entry) => entry.id === id);
  if (index < 0) throw new Error("Cette modification n’est plus dans l’historique.");
  return history.slice(0, index);
}

export function editorSnapshot(config: Record<string, unknown>) {
  return Object.fromEntries(editFields.map((field) => [field, config[field] ?? {}]));
}

export function recordEdit(config: Record<string, unknown>, label: string) {
  const parsed = editHistorySchema.safeParse(config["editHistory"] ?? []);
  const entry: HistoryEntry = {
    id: crypto.randomUUID(),
    label: label.slice(0, 300),
    at: new Date().toISOString(),
    state: editorSnapshot(config),
  };
  return [...(parsed.success ? parsed.data : []), entry].slice(-100);
}
