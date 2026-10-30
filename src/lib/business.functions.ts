import { createServerFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import { createClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database, Json } from "@/integrations/supabase/types";
import { configSchema, requestSchema } from "./business-schema";
import { z } from "zod";
import { defaultConfig, estimate, type BusinessConfig } from "./business";
import { priceConfiguration } from "./configurator";
import { geocodeAddress, haversineKm } from "./configurator";
import { applyDiscount, codePattern, normalizeCode, totalPercent } from "./discounts";
import { promoInputSchema, promoIsAvailable } from "./promo-codes";
import { themeColorsSchema, elementKeySchema, elementColorSchema, placedMediaSchema } from "./site-colors";
import { availabilityRangeSchema, generateAvailability } from "./availability-range";
import { typographyValueSchema } from "./site-typography";
import { recordEdit, editFields, editHistorySchema, historyBefore } from "./editor-history";
import { siteMediaSchema, publicationSchema, galleryItemSchema } from "./interventions";

export const prepareInterventionMedia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => siteMediaSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const ext = data.type === "video/quicktime" ? "mov" : data.type.split("/")[1];
    const path = `${crypto.randomUUID()}.${ext}`;
    const signed = await supabaseAdmin.storage.from("site-images").createSignedUploadUrl(path);
    if (signed.error || !signed.data) throw new Error("Préparation de l’envoi impossible.");
    return { path, token: signed.data.token, url: `/api/public/site-image/${path}` };
  });

export const publishIntervention = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => publicationSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").single();
    if (current.error) throw new Error("Lecture des réalisations impossible.");
    const config = { ...(current.data.config as Record<string, unknown>) };
    const gallery = z
      .array(galleryItemSchema)
      .max(499)
      .parse(config["gallery"] ?? []);
    const updated = [data, ...gallery];
    const saved = await context.supabase
      .from("business_settings")
      .update({ config: { ...config, gallery: updated } as Json, updated_at: new Date().toISOString() })
      .eq("id", "main");
    if (saved.error) throw new Error("Publication impossible.");
    return updated;
  });

export const getBusiness = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.from("business_settings").select("config").eq("id", "main").maybeSingle();
  if (error) {
    // Log the actual Supabase failure in Railway without exposing credentials.
    console.error("[TClean] getBusiness Supabase error", {
      message: error.message,
      code: error.code,
      details: error.details,
      hint: error.hint,
    });
    throw new Error("Les informations TClean sont temporairement indisponibles.");
  }
  return data?.config ?? null;
});

export const getSlots = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client.rpc("list_booking_slots");
  if (error) throw new Error("Les disponibilités ne sont pas accessibles.");
  return data ?? [];
});

interface BookingAlertPayload {
  id: string;
  kind: "booking" | "quote" | "contact";
  customer_name: string;
  phone: string;
  email: string;
  address: string;
  postal_code: string;
  city: string;
  slot_time?: string | null;
  service: string;
  quantity?: number;
  size?: string;
  condition?: string;
  message?: string;
  configurator?: any;
  payment_method: "onsite" | "online";
  base_amount: number | null;
  discount_code?: string | null;
  discount_percent?: number;
  amount: number | null;
  distanceKm?: number | null;
  photos_count?: number;
  files?: AlertFile[];
}
interface AlertFile {
  type: string;
  base64: string;
}

// Gmail limite un e-mail à 25 Mo : au-delà de ~18 Mo de fichiers, on n'attache que ce qui tient.
const MAX_ATTACH_B64 = 24_000_000;

function esc(str: unknown): string {
  if (str === null || str === undefined) return "";

  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function buildAlertMime(to: string, subject: string, text: string, files: AlertFile[], html?: string) {
  const enc = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
  const wrap = (s: string) => s.replace(/(.{76})/g, "$1\r\n");
  const mixedBoundary = `mixed_${crypto.randomUUID()}`;
  const altBoundary = `alt_${crypto.randomUUID()}`;

  let used = 0;
  const kept: AlertFile[] = [];
  for (const f of files) {
    if (used + f.base64.length > MAX_ATTACH_B64) continue;
    used += f.base64.length;
    kept.push(f);
  }
  const skipped = files.length - kept.length;
  const bodyText = skipped
    ? `${text}\n\n⚠️ ${skipped} fichier(s) trop lourd(s) pour l'e-mail : à voir dans l'administration.`
    : text;

  const parts: string[] = [
    `To: ${to}`,
    `Subject: ${subject}`,
    "From: =?UTF-8?B?VENsZWFuIFLDqXNlcnZhdGlvbg==?= <reservation@tclean-nettoyage.fr>",
    "Reply-To: reservation@tclean-nettoyage.fr",
    "MIME-Version: 1.0",
    `Content-Type: multipart/mixed; boundary="${mixedBoundary}"`,
    "",
    `--${mixedBoundary}`,
    `Content-Type: multipart/alternative; boundary="${altBoundary}"`,
    "",
    `--${altBoundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "Content-Transfer-Encoding: base64",
    "",
    wrap(enc(bodyText)),
  ];

  if (html) {
    const bodyHtml = skipped
      ? `${html}<p style="color:#b91c1c;font-size:12px;margin-top:16px;text-align:center;">⚠️ ${skipped} fichier(s) trop volumineux pour l'e-mail : consultables dans votre administration.</p>`
      : html;
    parts.push(
      `--${altBoundary}`,
      'Content-Type: text/html; charset="UTF-8"',
      "Content-Transfer-Encoding: base64",
      "",
      wrap(enc(bodyHtml)),
    );
  }

  parts.push(`--${altBoundary}--`);

  kept.forEach((f, i) => {
    const ext = f.type.split("/")[1] || "bin";
    const name = `${f.type.startsWith("video/") ? "video" : "photo"}-${i + 1}.${ext}`;
    parts.push(
      `--${mixedBoundary}`,
      `Content-Type: ${f.type}; name="${name}"`,
      `Content-Disposition: attachment; filename="${name}"`,
      "Content-Transfer-Encoding: base64",
      "",
      wrap(f.base64.replace(/\s/g, "")),
    );
  });
  parts.push(`--${mixedBoundary}--`, "");
  return btoa(parts.join("\r\n")).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function renderClientConfirmationHtml(details: BookingAlertPayload): string {
  const paymentLabel =
    details.payment_method === "online"
      ? "Payé en ligne par carte bancaire"
      : "Sur place lors de l'intervention (espèces / CB / chèque)";

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Confirmation de réservation TClean</title>
</head>
<body style="margin:0;padding:24px 12px;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:580px;margin:0 auto;background-color:#ffffff;border-radius:14px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">
    <!-- En-tête -->
    <tr>
      <td style="background:linear-gradient(135deg,#1b4332,#2d6a4f);padding:32px 24px;text-align:center;">
        <h1 style="margin:0;color:#ffffff;font-size:26px;letter-spacing:2px;font-weight:800;">TCLEAN</h1>
        <p style="margin:6px 0 0;color:#d8f3dc;font-size:12px;letter-spacing:1.5px;text-transform:uppercase;font-weight:600;">Nettoyage professionnel de mobilier à domicile</p>
      </td>
    </tr>

    <!-- Corps de message -->
    <tr>
      <td style="padding:28px 24px;">
        <!-- Badge de confirmation -->
        <div style="background-color:#edf7f0;border:1px solid #b7e4c7;border-radius:10px;padding:16px 20px;text-align:center;margin-bottom:24px;">
          <div style="display:inline-block;background-color:#2d6a4f;color:#ffffff;border-radius:50%;width:28px;height:28px;line-height:28px;font-size:16px;font-weight:bold;margin-bottom:6px;">✓</div>
          <h2 style="margin:4px 0 2px;color:#1b4332;font-size:18px;font-weight:700;">Votre réservation est confirmée</h2>
          <p style="margin:0;color:#40916c;font-size:13px;font-weight:600;">Dossier #${esc(details.id.slice(0, 8))}</p>
        </div>

        <p style="margin:0 0 16px;font-size:15px;line-height:1.6;color:#374151;">
          Bonjour <strong>${esc(details.customer_name)}</strong>,<br />
          Nous avons le plaisir de vous confirmer la bonne prise en compte de votre réservation. Notre technicien interviendra avec du matériel professionnel d'injection-extraction haute performance.
        </p>

        <!-- Récapitulatif du rendez-vous -->
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:10px;margin-bottom:24px;">
          ${
            details.slot_time
              ? `
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:38%;">📅 Date et heure</td>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;font-weight:700;">${esc(details.slot_time)}</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">📍 Lieu d'intervention</td>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;font-weight:600;">${esc(details.address)}<br /><span style="color:#6b7280;font-weight:normal;">${esc(details.postal_code)} ${esc(details.city)}</span></td>
          </tr>
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">🛋️ Prestation</td>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;font-weight:600;">${esc(details.service)}${details.quantity && details.quantity > 1 ? ` (Qté : ${esc(details.quantity)})` : ""}</td>
          </tr>
          ${
            details.amount != null
              ? `
          <tr>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">💶 Montant total TTC</td>
            <td style="padding:14px 18px;border-bottom:1px solid #e5e7eb;font-size:18px;color:#1b4332;font-weight:800;">${Number(details.amount).toFixed(2)} €</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:14px 18px;font-size:13px;color:#6b7280;">💳 Mode de règlement</td>
            <td style="padding:14px 18px;font-size:13px;color:#111827;font-weight:600;">${esc(paymentLabel)}</td>
          </tr>
        </table>

        <!-- Consignes pratiques -->
        <div style="background-color:#fefce8;border:1px solid #fef08a;border-radius:10px;padding:16px 18px;margin-bottom:24px;">
          <h3 style="margin:0 0 10px;color:#854d0e;font-size:14px;font-weight:700;">🧼 Consignes pratiques avant l'arrivée du technicien :</h3>
          <ul style="margin:0;padding-left:18px;color:#713f12;font-size:13px;line-height:1.6;">
            <li>Merci de dégager l'espace immédiat autour du mobilier à nettoyer.</li>
            <li>Nous aurons simplement besoin d'un accès à une prise électrique et un point d'eau.</li>
            <li>Temps de séchage moyen indicatif : <strong>4 à 8 heures</strong> selon l'aération et la saison.</li>
          </ul>
        </div>

        <!-- Contact & urgence -->
        <div style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:10px;padding:16px 18px;text-align:center;">
          <p style="margin:0 0 8px;font-size:13px;color:#166534;font-weight:600;">Besoin d'aide, question ou modification d'horaire ?</p>
          <a href="tel:0744881170" style="display:inline-block;background-color:#1b4332;color:#ffffff;text-decoration:none;padding:10px 22px;border-radius:8px;font-size:14px;font-weight:700;">📞 07 44 88 11 70</a>
          <p style="margin:8px 0 0;font-size:11px;color:#15803d;">En cas d'empêchement, merci de nous avertir au moins 24h à l'avance.</p>
        </div>
      </td>
    </tr>

    <!-- Pied de page -->
    <tr>
      <td style="background-color:#f9fafb;border-top:1px solid #e5e7eb;padding:20px;text-align:center;font-size:12px;color:#6b7280;line-height:1.5;">
        <strong style="color:#111827;">TClean</strong> • Nettoyage professionnel de canapés, matelas et mobilier textile à domicile<br />
        Strasbourg & Eurométropole • <a href="https://tclean-nettoyage.fr" style="color:#2d6a4f;text-decoration:none;font-weight:600;">tclean-nettoyage.fr</a>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

function renderAdminAlertHtml(details: BookingAlertPayload): string {
  const isBooking = details.kind === "booking";
  const kindTitle = isBooking ? "NOUVELLE RÉSERVATION CONFIRMÉE" : "NOUVELLE DEMANDE DE DEVIS & CONFIGURATION";
  const headerBg = isBooking ? "linear-gradient(135deg,#1b4332,#2d6a4f)" : "linear-gradient(135deg,#1e3a5f,#2b4c7e)";
  const paymentLabel =
    details.payment_method === "online" ? "Payé en ligne par carte bancaire" : "Sur place (espèces / chèque / CB)";

  const mapsQuery = encodeURIComponent(`${details.address} ${details.postal_code} ${details.city}`);
  const mapsUrl = `https://www.google.com/maps/search/?api=1&query=${mapsQuery}`;

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${esc(kindTitle)}</title>
</head>
<body style="margin:0;padding:20px 10px;background-color:#f4f6f8;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1f2937;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:620px;margin:0 auto;background-color:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 4px 16px rgba(0,0,0,0.06);border:1px solid #e5e7eb;">
    <!-- En-tête -->
    <tr>
      <td style="background:${headerBg};padding:24px;text-align:center;">
        <span style="display:inline-block;background:rgba(255,255,255,0.2);color:#ffffff;font-size:11px;font-weight:700;letter-spacing:1px;padding:4px 12px;border-radius:20px;text-transform:uppercase;margin-bottom:8px;">${isBooking ? "🔔 Rendez-vous planifié" : "📩 Nouveau lead"}</span>
        <h1 style="margin:4px 0 0;color:#ffffff;font-size:20px;font-weight:800;">${esc(kindTitle)}</h1>
        <p style="margin:4px 0 0;color:#d1fae5;font-size:12px;">Dossier #${esc(details.id.slice(0, 8))}</p>
      </td>
    </tr>

    <!-- Actions rapides 1 clic -->
    <tr>
      <td style="padding:16px 20px;background-color:#f9fafb;border-bottom:1px solid #e5e7eb;text-align:center;">
        <a href="tel:${esc(details.phone)}" style="display:inline-block;background-color:#1b4332;color:#ffffff;text-decoration:none;padding:10px 18px;border-radius:8px;font-size:13px;font-weight:700;margin:4px;">📞 Appeler le client (${esc(details.phone)})</a>
        <a href="${mapsUrl}" target="_blank" style="display:inline-block;background-color:#ffffff;color:#1b4332;border:1px solid #1b4332;text-decoration:none;padding:9px 18px;border-radius:8px;font-size:13px;font-weight:700;margin:4px;">🗺️ Ouvrir l'itinéraire</a>
      </td>
    </tr>

    <!-- Corps -->
    <tr>
      <td style="padding:22px 20px;">
        <!-- Fiche Client -->
        <h2 style="margin:0 0 10px;font-size:14px;color:#1b4332;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">👤 Coordonnées du client</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:18px;">
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:32%;">Nom complet</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;font-weight:700;">${esc(details.customer_name)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Téléphone</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;font-weight:600;"><a href="tel:${esc(details.phone)}" style="color:#1b4332;text-decoration:none;">${esc(details.phone)}</a></td>
          </tr>
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">E-mail</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;">${details.email ? `<a href="mailto:${esc(details.email)}" style="color:#2563eb;text-decoration:none;">${esc(details.email)}</a>` : "Non renseigné"}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:13px;color:#6b7280;">Adresse</td>
            <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;">${esc(details.address)}<br /><span style="color:#6b7280;font-weight:normal;">${esc(details.postal_code)} ${esc(details.city)}</span></td>
          </tr>
        </table>

        <!-- Date & Créneau si réservation -->
        ${
          details.slot_time
            ? `
        <div style="background-color:#edf7f0;border:1px solid #b7e4c7;border-radius:8px;padding:12px 16px;margin-bottom:18px;">
          <div style="font-size:11px;color:#2d6a4f;text-transform:uppercase;font-weight:700;letter-spacing:0.8px;">📅 Date et heure du rendez-vous</div>
          <div style="font-size:16px;color:#1b4332;font-weight:800;margin-top:2px;">${esc(details.slot_time)}</div>
        </div>`
            : ""
        }

        <!-- Prestation de base -->
        <h2 style="margin:0 0 10px;font-size:14px;color:#1b4332;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">🛋️ Mobilier & Prestation</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:18px;">
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:32%;">Service</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;font-weight:700;">${esc(details.service)}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;${details.size || details.condition ? "border-bottom:1px solid #e5e7eb;" : ""}font-size:13px;color:#6b7280;">Quantité</td>
            <td style="padding:10px 14px;${details.size || details.condition ? "border-bottom:1px solid #e5e7eb;" : ""}font-size:13px;color:#111827;">${esc(details.quantity ?? 1)}</td>
          </tr>
          ${
            details.size
              ? `
          <tr>
            <td style="padding:10px 14px;${details.condition ? "border-bottom:1px solid #e5e7eb;" : ""}font-size:13px;color:#6b7280;">Format</td>
            <td style="padding:10px 14px;${details.condition ? "border-bottom:1px solid #e5e7eb;" : ""}font-size:13px;color:#111827;">${esc(details.size)}</td>
          </tr>`
              : ""
          }
          ${
            details.condition
              ? `
          <tr>
            <td style="padding:10px 14px;font-size:13px;color:#6b7280;">État indiqué</td>
            <td style="padding:10px 14px;font-size:13px;color:#111827;">${esc(details.condition)}</td>
          </tr>`
              : ""
          }
        </table>

        <!-- Détails du configurateur -->
        ${
          details.configurator
            ? (() => {
                const cfg = details.configurator;
                const soilLabel =
                  cfg.soil === "heavy" ? "Tenace / très incrustée" : cfg.soil === "moderate" ? "Moyenne" : "Légère";
                const specs = [
                  cfg.stains ? "Taches visibles" : null,
                  cfg.odors ? "Odeurs incrustées" : null,
                  cfg.pets ? "Présence d'animaux" : null,
                  cfg.removable ? "Coussins déhoussables" : "Non déhoussable",
                ]
                  .filter(Boolean)
                  .join(", ");
                const options = [
                  cfg.decorative ? "Coussins déco" : null,
                  cfg.pouf ? "Pouf" : null,
                  cfg.extraArmchairs ? `${cfg.extraArmchairs} fauteuil(s) suppl.` : null,
                  cfg.extraChairs ? `${cfg.extraChairs} chaise(s) suppl.` : null,
                ]
                  .filter(Boolean)
                  .join(", ");

                return `
          <h2 style="margin:0 0 10px;font-size:14px;color:#1b4332;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">⚙️ Détails du configurateur</h2>
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0fdf4;border:1px solid #bbf7d0;border-radius:8px;margin-bottom:18px;">
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#166534;width:32%;">Modèle & Tissu</td>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#111827;font-weight:600;">${esc(cfg.type ?? "Non spécifié")} • Tissu : ${esc(cfg.fabric ?? "Standard")}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#166534;">Couleur</td>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#111827;">${esc(cfg.color ?? "")}${cfg.otherColor ? ` (${esc(cfg.otherColor)})` : ""}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#166534;">Degré de salissure</td>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#b45309;font-weight:700;">${esc(soilLabel)}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#166534;">Spécificités</td>
              <td style="padding:10px 14px;border-bottom:1px solid #dcfce7;font-size:13px;color:#111827;">${esc(specs || "Aucune")}</td>
            </tr>
            <tr>
              <td style="padding:10px 14px;font-size:13px;color:#166534;">Options ajoutées</td>
              <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;">${esc(options || "Aucune")}</td>
            </tr>
          </table>`;
              })()
            : ""
        }

        <!-- Message client -->
        ${
          details.message && details.message.trim()
            ? `
        <div style="background-color:#fefce8;border-left:4px solid #eab308;padding:12px 16px;border-radius:4px;margin-bottom:18px;">
          <div style="font-size:12px;font-weight:700;color:#854d0e;margin-bottom:4px;">💬 Message / Remarque du client :</div>
          <div style="font-size:13px;color:#713f12;font-style:italic;">« ${esc(details.message.trim())} »</div>
        </div>`
            : ""
        }

        <!-- Tarifs & Paiement -->
        <h2 style="margin:0 0 10px;font-size:14px;color:#1b4332;text-transform:uppercase;letter-spacing:0.8px;font-weight:700;">💶 Tarification & Règlement</h2>
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;border:1px solid #e5e7eb;border-radius:8px;margin-bottom:18px;">
          ${
            details.base_amount != null
              ? `
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;width:32%;">Prix de base</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;">${Number(details.base_amount).toFixed(2)} €</td>
          </tr>`
              : ""
          }
          ${
            details.distanceKm !== null && details.distanceKm !== undefined
              ? `
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Déplacement</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#111827;">${Math.round(details.distanceKm)} km</td>
          </tr>`
              : ""
          }
          ${
            details.discount_code
              ? `
          <tr>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#6b7280;">Code promo</td>
            <td style="padding:10px 14px;border-bottom:1px solid #e5e7eb;font-size:13px;color:#15803d;font-weight:600;">${esc(details.discount_code)} (-${esc(details.discount_percent ?? 0)}%)</td>
          </tr>`
              : ""
          }
          <tr>
            <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:14px;color:#111827;font-weight:700;">Total TTC</td>
            <td style="padding:12px 14px;border-bottom:1px solid #e5e7eb;font-size:18px;color:#1b4332;font-weight:800;">${details.amount != null ? `${Number(details.amount).toFixed(2)} €` : "À confirmer"}</td>
          </tr>
          <tr>
            <td style="padding:10px 14px;font-size:13px;color:#6b7280;">Paiement</td>
            <td style="padding:10px 14px;font-size:13px;color:#111827;font-weight:600;">${esc(paymentLabel)}</td>
          </tr>
        </table>

        <!-- Pièces jointes -->
        <div style="font-size:12px;color:#6b7280;text-align:right;">
          📷 ${details.photos_count ?? 0} photo(s) jointe(s) reçue(s)
        </div>
      </td>
    </tr>
  </table>
</body>
</html>`;
}

async function sendBookingAlert(details: BookingAlertPayload) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  if (!LOVABLE_API_KEY) return;

  const roleEmail =
    details.kind === "booking"
      ? "reservation@tclean-nettoyage.fr"
      : details.kind === "quote"
        ? "devis@tclean-nettoyage.fr"
        : "contact@tclean-nettoyage.fr";
  const to = process.env["ALERT_EMAIL"] || roleEmail;

  const fromSender =
    details.kind === "booking"
      ? "TClean Réservation <reservation@notify.tclean-nettoyage.fr>"
      : details.kind === "quote"
        ? "TClean Devis <devis@notify.tclean-nettoyage.fr>"
        : "TClean Contact <contact@notify.tclean-nettoyage.fr>";

  const replyTo = details.email && details.email.includes("@") ? details.email : roleEmail;

  const kindLabel =
    details.kind === "booking" ? "RÉSERVATION CONFIRMÉE" : details.kind === "quote" ? "DEMANDE DE DEVIS" : "CONTACT";
  const paymentLabel =
    details.payment_method === "online" ? "En ligne par carte bancaire" : "Sur place (espèces / chèque / CB)";

  const lines: string[] = [
    `🔔 NOUVELLE ${kindLabel} - TCLEAN`,
    `Référence : #${details.id.slice(0, 8)}`,
    "--------------------------------------------------",
    "",
    "👤 CLIENT :",
    `• Nom : ${details.customer_name}`,
    `• Téléphone : ${details.phone}`,
    `• E-mail : ${details.email || "Non renseigné"}`,
    `• Adresse : ${details.address}`,
    `• Ville : ${details.postal_code} ${details.city}`,
    "",
  ];

  if (details.slot_time) {
    lines.push("📅 DATE ET HEURE DU RENDEZ-VOUS :", `• Créneau : ${details.slot_time}`, "");
  }

  lines.push(
    "🛋️ PRESTATION & MOBILIER :",
    `• Service : ${details.service}`,
    `• Quantité : ${details.quantity ?? 1}`,
    details.size ? `• Taille / Format : ${details.size}` : "",
    details.condition ? `• État / Description : ${details.condition}` : "",
  );

  if (details.configurator) {
    const cfg = details.configurator;
    const soilLabel = cfg.soil === "heavy" ? "Tenace / très incrustée" : cfg.soil === "moderate" ? "Moyenne" : "Légère";
    const specs = [
      cfg.stains ? "Taches" : null,
      cfg.odors ? "Odeurs" : null,
      cfg.pets ? "Animaux" : null,
      cfg.removable ? "Déhoussable" : "Non déhoussable",
    ]
      .filter(Boolean)
      .join(", ");
    const options = [
      cfg.decorative ? "Coussins déco" : null,
      cfg.pouf ? "Pouf" : null,
      cfg.extraArmchairs ? `${cfg.extraArmchairs} fauteuil(s) suppl.` : null,
      cfg.extraChairs ? `${cfg.extraChairs} chaise(s) suppl.` : null,
    ]
      .filter(Boolean)
      .join(", ");

    lines.push(
      "",
      "⚙️ DÉTAILS DU CONFIGURATEUR :",
      `• Modèle : ${cfg.type ?? "Non spécifié"}`,
      `• Tissu : ${cfg.fabric ?? "Non spécifié"}`,
      `• Couleur : ${cfg.color ?? ""}${cfg.otherColor ? ` (${cfg.otherColor})` : ""}`,
      `• Degré de salissure : ${soilLabel}`,
      `• Spécificités : ${specs || "Aucune"}`,
      `• Options ajoutées : ${options || "Aucune"}`,
    );
  }

  if (details.message && details.message.trim()) {
    lines.push("", "💬 REMARQUE / MESSAGE DU CLIENT :", `"${details.message.trim()}"`);
  }

  lines.push(
    "",
    "💶 TARIFICATION & PAIEMENT :",
    details.base_amount != null ? `• Montant de base : ${Number(details.base_amount).toFixed(2)} €` : "",
    details.distanceKm !== null && details.distanceKm !== undefined
      ? `• Déplacement : ${Math.round(details.distanceKm)} km`
      : "",
    details.discount_code ? `• Code promo : ${details.discount_code} (-${details.discount_percent ?? 0}%)` : "",
    `• Montant total TTC : ${details.amount != null ? `${Number(details.amount).toFixed(2)} €` : "À confirmer"}`,
    `• Mode de règlement : ${paymentLabel}`,
    "",
    `📷 Photos jointes : ${details.photos_count ?? 0} photo(s)`,
  );

  const text = lines.filter((l) => l !== "").join("\n");
  const html = renderAdminAlertHtml(details);
  const subject = `[TClean] ${kindLabel} - ${details.customer_name} (${details.amount != null ? `${Number(details.amount).toFixed(2)} €` : "À confirmer"})`;

  await fetch("https://api.lovable.dev/v1/messaging/email/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to,
      from: fromSender,
      sender_domain: "notify.tclean-nettoyage.fr",
      reply_to: replyTo,
      subject,
      text,
      html,
      purpose: "transactional",
      idempotency_key: `admin-alert-${details.id}`,
    }),
  }).catch((e) => console.error("Alerte e-mail échouée", e));
}
async function sendClientBookingConfirmation(details: BookingAlertPayload) {
  if (!details.email || !details.email.includes("@")) return;

  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  if (!LOVABLE_API_KEY) return;

  const paymentLabel =
    details.payment_method === "online"
      ? "Payé en ligne par carte bancaire"
      : "Sur place lors de l'intervention (espèces / CB / chèque)";

  const lines: string[] = [
    `Bonjour ${details.customer_name},`,
    "",
    "Nous avons le plaisir de vous confirmer la bonne prise en compte de votre réservation de nettoyage à domicile TClean.",
    "",
    "📋 DÉTAILS DE VOTRE RENDEZ-VOUS :",
    `• Référence : #${details.id.slice(0, 8)}`,
    details.slot_time ? `• Date et heure : ${details.slot_time}` : "",
    `• Adresse d'intervention : ${details.address}, ${details.postal_code} ${details.city}`,
    `• Prestation : ${details.service}`,
    details.quantity ? `• Quantité : ${details.quantity}` : "",
    details.amount != null ? `• Montant total TTC : ${Number(details.amount).toFixed(2)} €` : "",
    `• Mode de règlement : ${paymentLabel}`,
    "",
    "🧼 CONSIGNES PRATIQUES AVANT L'ARRIVÉE DU TECHNICIEN :",
    "• Merci de libérer l'espace direct autour du mobilier à traiter.",
    "• Nous aurons simplement besoin d'un accès à une prise électrique et un point d'eau.",
    "• Temps de séchage moyen indicatif : 4 à 8 heures selon la ventilation de la pièce.",
    "",
    "📞 BESOIN D'AIDE OU MODIFICATION :",
    "En cas d'empêchement ou pour toute question, merci de nous contacter au moins 24h à l'avance au 07 44 88 11 70.",
    "",
    "À très bientôt,",
    "L'équipe TClean - Nettoyage professionnel de mobilier à domicile",
    "Téléphone : 07 44 88 11 70",
    "E-mail : reservation@tclean-nettoyage.fr",
    "Site web : https://tclean-nettoyage.fr",
  ];

  const text = lines.filter((l) => l !== "").join("\n");
  const html = renderClientConfirmationHtml(details);
  const subject = `Confirmation de votre réservation TClean (#${details.id.slice(0, 8)})`;

  await fetch("https://api.lovable.dev/v1/messaging/email/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      to: details.email,
      from: "TClean Réservation <reservation@notify.tclean-nettoyage.fr>",
      sender_domain: "notify.tclean-nettoyage.fr",
      reply_to: "reservation@tclean-nettoyage.fr",
      subject,
      text,
      html,
      purpose: "transactional",
      idempotency_key: `client-booking-${details.id}`,
    }),
  }).catch((e) => console.error("Envoi e-mail confirmation client échoué", e));
}
export const submitRequest = createServerFn({ method: "POST" })
  .inputValidator((input) => requestSchema.parse(input))
  .handler(async ({ data }) => {
    if (data.honeypot) throw new Error("Demande non valide.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const req = getRequest();
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    for (const identifier of [`ip:${ip}`, `phone:${data.phone.replace(/\D/g, "")}`]) {
      const bytes = new TextEncoder().encode(identifier);
      const digest = await crypto.subtle.digest("SHA-256", bytes);
      const key = Array.from(new Uint8Array(digest))
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      const limit = await supabaseAdmin.rpc("consume_form_attempt", { _key: key });
      if (limit.error || !limit.data)
        throw new Error("Trop de demandes. Merci de nous appeler ou de réessayer plus tard.");
    }
    const settings = await supabaseAdmin.from("business_settings").select("config").eq("id", "main").maybeSingle();
    const config = configSchema.parse({ ...defaultConfig, ...(settings.data?.config as object) });
    const service = config.services.find((s) => s.slug === data.details.service && s.enabled);
    if (data.kind !== "contact" && !service) throw new Error("Veuillez choisir une prestation disponible.");
    if (data.kind === "booking" && (!data.slot_id || !data.address.trim()))
      throw new Error("Choisissez un créneau et renseignez votre adresse.");
    const id = crypto.randomUUID();
    const paths: string[] = [];
    try {
      for (const photo of data.photos) {
        const binary = Uint8Array.from(atob(photo.base64), (c) => c.charCodeAt(0));
        if (binary.length > 5 * 1024 * 1024) throw new Error("Chaque photo doit peser moins de 5 Mo.");
        const valid =
          (photo.type === "image/jpeg" && binary[0] === 255 && binary[1] === 216) ||
          (photo.type === "image/png" && binary[0] === 137 && binary[1] === 80 && binary[2] === 78) ||
          (photo.type === "image/webp" &&
            String.fromCharCode(...binary.slice(0, 4)) === "RIFF" &&
            String.fromCharCode(...binary.slice(8, 12)) === "WEBP");
        if (!valid) throw new Error("Format de photo non valide.");
        const path = `${id}/${crypto.randomUUID()}.${photo.type.split("/")[1]}`;
        const result = await supabaseAdmin.storage
          .from("quote-photos")
          .upload(path, binary, { contentType: photo.type });
        if (result.error) throw new Error("Impossible de joindre la photo.");
        paths.push(path);
      }
      let distanceKm: number | null = null;
      if (data.details.configurator) {
        const point = await geocodeAddress(`${data.address} ${data.postal_code} ${data.city}`.trim()).catch(() => null);
        if (!point)
          throw new Error("Adresse introuvable. Vérifiez votre adresse pour calculer les frais de déplacement.");
        distanceKm = haversineKm(point.lon, point.lat);
      }
      const base = data.details.configurator
        ? priceConfiguration(config as unknown as BusinessConfig, data.details.configurator, distanceKm).total
        : estimate(config as unknown as BusinessConfig, data.details.service, data.details.quantity);
      const token = req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
      let userId: string | null = null;
      if (token) {
        const u = await supabaseAdmin.auth.getUser(token);
        userId = u.data.user?.id ?? null;
      }
      const code = normalizeCode(data.discount_code);
      let codePercent = 0;
      if (code) {
        if (!codePattern.test(code)) throw new Error("Code de réduction non valide.");
        const d = await supabaseAdmin.from("discount_codes").select("*").eq("code", code).maybeSingle();
        if (d.error) throw new Error("Vérification du code impossible.");
        if (!promoIsAvailable(d.data)) throw new Error("Ce code est expiré, indisponible ou déjà utilisé.");
        codePercent = Number(d.data.percent);
      }
      let profileComplete = false;
      if (userId) {
        const p = await supabaseAdmin
          .from("profiles")
          .select("full_name,phone,address,postal_code,city")
          .eq("id", userId)
          .maybeSingle();
        profileComplete = !!(
          p.data &&
          p.data.full_name.trim() &&
          p.data.phone.trim() &&
          p.data.address.trim() &&
          p.data.postal_code.trim() &&
          p.data.city.trim()
        );
      }
      const percent = totalPercent(!!userId, codePercent, profileComplete);
      const amount = applyDiscount(base, percent);
      if (data.payment_method === "online" && !userId)
        throw new Error("Connectez-vous à votre compte pour payer en ligne, ou choisissez le paiement sur place.");
      if (data.payment_method === "online" && (amount === null || amount < 0.5))
        throw new Error("Le paiement en ligne n'est pas possible pour ce montant. Choisissez le paiement sur place.");
      const { error } = await supabaseAdmin.from("quote_requests").insert({
        id,
        kind: data.kind,
        customer_name: data.customer_name,
        phone: data.phone,
        email: data.email,
        postal_code: data.postal_code,
        city: data.city,
        address: data.address,
        details: data.details,
        slot_id: data.kind === "booking" ? data.slot_id : null,
        attachments: paths,
        amount,
        base_amount: base,
        discount_percent: percent,
        discount_code: code || null,
        user_id: userId,
        payment_method: data.payment_method,
      });
      if (error?.message.includes("PROMO_INVALID"))
        throw new Error("Ce code est expiré ou vient d’être utilisé. Retirez-le puis réessayez.");
      if (error)
        throw new Error(
          data.kind === "booking"
            ? "Ce créneau n'est plus disponible. Choisissez-en un autre."
            : "La demande n'a pas pu être enregistrée. Merci de réessayer.",
        );
      const sendBot = async () => {
        if (!userId || data.kind === "contact") return;
        const { botInstructions } = await import("./tclean-bot.server");
        const body = await botInstructions({
          kind: data.kind,
          customer_name: data.customer_name,
          details: data.details,
        });
        await supabaseAdmin
          .from("request_messages")
          .insert({ request_id: id, sender_id: userId, is_admin: true, is_bot: true, body, attachment: "" });
      };
      if (data.kind === "booking") {
        await supabaseAdmin.from("quote_requests").update({ status: "confirmed" }).eq("id", id);
        const m = statusNotification("confirmed", data.customer_name, data.kind);
        if (userId && m) {
          await supabaseAdmin
            .from("request_messages")
            .insert({ request_id: id, sender_id: userId, is_admin: true, body: m.body, attachment: "" });
          await supabaseAdmin
            .from("client_notifications")
            .insert({ user_id: userId, request_id: id, title: m.title, body: m.body });
        }

        let slotTime = data.details.date || null;
        if (data.slot_id) {
          const { data: slotRow } = await supabaseAdmin
            .from("availability")
            .select("starts_at")
            .eq("id", data.slot_id)
            .maybeSingle();
          if (slotRow?.starts_at) {
            const d = new Date(slotRow.starts_at);
            slotTime = d.toLocaleString("fr-FR", {
              timeZone: "Europe/Paris",
              weekday: "long",
              day: "numeric",
              month: "long",
              year: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            });
          }
        }
        // E-mails, SMS et bot partent en parallèle ; on attend leur envoi (sinon le serveur les coupe)
        await Promise.allSettled([
          (async () => {
            try {
              await sendBot();
            } catch (e) {
              console.error("Bot IA échoué", e);
            }
          })(),
          (async () => {
            try {
              await sendBookingAlert({
                id,
                kind: data.kind,
                customer_name: data.customer_name,
                phone: data.phone,
                email: data.email,
                address: data.address,
                postal_code: data.postal_code,
                city: data.city,
                slot_time: slotTime,
                service: data.details.service,
                quantity: data.details.quantity,
                size: data.details.size,
                condition: data.details.condition,
                message: data.details.message,
                configurator: data.details.configurator,
                payment_method: data.payment_method,
                base_amount: base,
                discount_code: code || null,
                discount_percent: percent,
                amount,
                distanceKm,
                photos_count: paths.length,
                files: data.photos.map((p) => ({ type: p.type, base64: p.base64 })),
              });
            } catch (e) {
              console.error("Alerte e-mail échouée", e);
            }
          })(),
          (async () => {
            if (data.email && data.email.includes("@")) {
              try {
                await sendClientBookingConfirmation({
                  id,
                  kind: data.kind,
                  customer_name: data.customer_name,
                  phone: data.phone,
                  email: data.email,
                  address: data.address,
                  postal_code: data.postal_code,
                  city: data.city,
                  slot_time: slotTime,
                  service: data.details.service,
                  quantity: data.details.quantity,
                  size: data.details.size,
                  condition: data.details.condition,
                  message: data.details.message,
                  configurator: data.details.configurator,
                  payment_method: data.payment_method,
                  base_amount: base,
                  discount_code: code || null,
                  discount_percent: percent,
                  amount,
                  distanceKm,
                  photos_count: paths.length,
                });
              } catch (e) {
                console.error("Confirmation client échouée", e);
              }
            }
          })(),
          (async () => {
            try {
              const { sendBookingSms } = await import("./sms.server");
              await sendBookingSms({
                id,
                customer_name: data.customer_name,
                phone: data.phone,
                slotTime,
                city: data.city,
              });
            } catch (e) {
              console.error("SMS réservation échoué", e);
            }
          })(),
        ]);

        return { id, amount, confirmed: true };
      }
      await sendBot();
      await sendBookingAlert({
        id,
        kind: data.kind,
        customer_name: data.customer_name,
        phone: data.phone,
        email: data.email,
        address: data.address,
        postal_code: data.postal_code,
        city: data.city,
        slot_time: null,
        service: data.details.service,
        quantity: data.details.quantity,
        size: data.details.size,
        condition: data.details.condition,
        message: data.details.message,
        configurator: data.details.configurator,
        payment_method: data.payment_method,
        base_amount: base,
        discount_code: code || null,
        discount_percent: percent,
        amount,
        distanceKm,
        photos_count: paths.length,
        files: data.photos.map((p) => ({ type: p.type, base64: p.base64 })),
      }).catch((e) => console.error("Alerte e-mail échouée", e));
      return { id, amount, confirmed: false };
    } catch (error) {
      if (paths.length) await supabaseAdmin.storage.from("quote-photos").remove(paths);
      throw error;
    }
  });

export const getAdminData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) return { allowed: false as const, requests: [], slots: [] };
    const [requests, slots, messages] = await Promise.all([
      context.supabase.from("quote_requests").select("*").order("created_at", { ascending: false }).limit(200),
      context.supabase.from("availability").select("*").order("starts_at"),
      context.supabase.from("request_messages").select("*").order("created_at").limit(1000),
    ]);
    if (requests.error || slots.error) throw new Error("Impossible de charger les demandes.");
    return {
      allowed: true as const,
      requests: (requests.data ?? []).map(({ booking_period, ...request }) => request),
      slots: slots.data ?? [],
      messages: messages.data ?? [],
    };
  });

export const saveBusiness = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => configSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: data as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

const statusNotification = (status: string, name: string, kind: string): { title: string; body: string } | null => {
  const hello = `Bonjour ${name},`;
  const sign = "— L’équipe TClean";
  switch (status) {
    case "confirmed":
      return {
        title: "Votre rendez-vous est confirmé",
        body: `${hello} nous avons le plaisir de vous confirmer votre rendez-vous de nettoyage. Nous intervenons à la date et à l’heure convenues. Merci de votre confiance. ${sign}`,
      };
    case "accepted":
      return {
        title: "Votre devis est accepté",
        body: `${hello} nous vous remercions d’avoir accepté notre devis. Nous revenons vers vous très rapidement pour convenir de la suite. ${sign}`,
      };
    case "refused":
      return {
        title: "Réponse à votre demande",
        body: `${hello} après une étude attentive, nous ne sommes malheureusement pas en mesure de donner suite à votre demande. Nous vous remercions de votre compréhension et restons à votre disposition. ${sign}`,
      };
    case "cancelled":
      return {
        title: "Votre rendez-vous est annulé",
        body: `${hello} votre rendez-vous a été annulé. Pour toute question ou pour convenir d’une nouvelle date, vous pouvez nous répondre depuis votre espace client ou nous appeler. ${sign}`,
      };
    case "completed":
      return {
        title: "Votre intervention est terminée",
        body: `${hello} votre nettoyage est terminé. Nous espérons que le résultat vous donne entière satisfaction. N’hésitez pas à partager votre avis sur le site. ${sign}`,
      };
    case "expired":
      return {
        title: "Votre demande a expiré",
        body: `${hello} faute de suite, votre ${kind === "booking" ? "réservation" : "demande"} a expiré. Vous pouvez renouveler votre demande à tout moment depuis le site. ${sign}`,
      };
    default:
      return null;
  }
};

export const updateRequest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid(),
        status: z.enum(["pending", "confirmed", "refused", "cancelled", "completed", "accepted", "expired"]),
        internal_notes: z.string().max(4000),
        amount: z.number().nonnegative().nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const { id, ...values } = data;
    const before = await context.supabase
      .from("quote_requests")
      .select("status,user_id,customer_name,kind")
      .eq("id", id)
      .single();
    if (before.error || !before.data) throw new Error("Demande introuvable.");
    const { data: row, error } = await context.supabase
      .from("quote_requests")
      .update(values)
      .eq("id", id)
      .select("id")
      .single();
    if (error || !row) throw new Error("Modification impossible ou accès refusé.");
    if (before.data.user_id && before.data.status !== values.status) {
      const message = statusNotification(values.status, before.data.customer_name, before.data.kind);
      if (message) {
        await context.supabase
          .from("request_messages")
          .insert({ request_id: id, sender_id: context.userId, is_admin: true, body: message.body, attachment: "" });
        await context.supabase
          .from("client_notifications")
          .insert({ user_id: before.data.user_id, request_id: id, title: message.title, body: message.body });
      }
    }
    return { ok: true };
  });

export const saveSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        id: z.string().uuid().optional(),
        starts_at: z.string().datetime(),
        ends_at: z.string().datetime(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (new Date(data.starts_at) <= new Date() || new Date(data.ends_at) <= new Date(data.starts_at))
      throw new Error("Choisissez une période future valide.");
    const { id, ...values } = data;
    const result = id
      ? await context.supabase
          .from("availability")
          .update({ ...values, enabled: true })
          .eq("id", id)
          .select("id")
          .single()
      : await context.supabase.from("availability").insert(values).select("id").single();
    if (result.error || !result.data)
      throw new Error("Créneau en conflit ou déjà réservé : annulez d’abord la réservation pour le modifier.");
    return { ok: true };
  });

export const openAvailabilityRange = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => availabilityRangeSchema.parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const settings = await context.supabase.from("business_settings").select("config").eq("id", "main").single();
    if (settings.error) throw new Error("Impossible de lire la durée des rendez-vous.");
    const config = configSchema.parse({ ...defaultConfig, ...(settings.data.config as object) });
    const slots = generateAvailability(data, config.bookingDuration);
    if (!slots.length)
      throw new Error("Aucun créneau futur : vérifiez les dates, les jours et la durée des rendez-vous.");
    const { data: count, error } = await context.supabase.rpc("open_availability_range", { _slots: slots });
    if (error) throw new Error("La période n’a pas pu être ouverte. Réessayez.");
    return { count: count ?? 0 };
  });

export const disableSlot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.string().uuid().parse(input))
  .handler(async ({ data, context }) => {
    const { error } = await context.supabase.from("availability").update({ enabled: false }).eq("id", data);
    if (error) throw new Error("Modification impossible.");
    return { ok: true };
  });

export const getPhotoUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.string().max(300).parse(input))
  .handler(async ({ data, context }) => {
    const { data: result, error } = await context.supabase.storage.from("quote-photos").createSignedUrl(data, 300);
    if (error) throw new Error("Accès à la photo refusé.");
    return result.signedUrl;
  });

const overrideInput = z.object({
  kind: z.enum(["text", "image", "link", "hide", "typography"]),
  key: z.string().min(1).max(2000),
  value: z.string().max(4000).nullable(),
  audience: z.enum(["all", "admin", "client"]).default("all"),
});

export const saveSiteColors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .discriminatedUnion("kind", [
        z.object({ kind: z.literal("theme"), colors: themeColorsSchema }),
        z.object({ kind: z.literal("element"), key: elementKeySchema, colors: elementColorSchema.nullable() }),
        z.object({ kind: z.literal("media"), key: elementKeySchema, media: placedMediaSchema.nullable() }),
      ])
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error) throw new Error("Lecture impossible.");
    const config = { ...((current.data?.config as Record<string, unknown>) ?? {}) };
    config["editHistory"] = recordEdit(
      config,
      data.kind === "theme" ? "Couleurs du site" : data.kind === "media" ? "Média ajouté" : "Couleurs d’un élément",
    );
    if (data.kind === "theme") config["themeColors"] = data.colors;
    else if (data.kind === "media") {
      const map = { ...((config["media"] as Record<string, unknown>) ?? {}) };
      if (data.media === null) delete map[data.key];
      else map[data.key] = data.media;
      config["media"] = map;
    } else {
      const map = { ...((config["elementColors"] as Record<string, unknown>) ?? {}) };
      if (data.colors === null) delete map[data.key];
      else map[data.key] = data.colors;
      config["elementColors"] = map;
    }
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: config as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

export const saveOverride = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => overrideInput.parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error) throw new Error("Lecture impossible.");
    const config = { ...((current.data?.config as Record<string, unknown>) ?? {}) };
    const field =
      data.kind === "text"
        ? "content"
        : data.kind === "image"
          ? "images"
          : data.kind === "hide"
            ? "hidden"
            : data.kind === "typography"
              ? "typography"
              : "links";
    if (data.kind === "typography" && data.value !== null) typographyValueSchema.parse(data.value);
    const labels = {
      text: "Texte",
      image: "Photo",
      hide: "Suppression / rétablissement",
      link: "Redirection",
      typography: "Taille et police",
    };
    config["editHistory"] = recordEdit(config, `${labels[data.kind]} — ${data.key.slice(0, 100)}`);
    if (data.kind === "link" && data.value !== null && !/^\/[a-zA-Z0-9\-_/]*$/.test(data.value))
      throw new Error("Page non valide.");
    const map = { ...((config[field] as Record<string, string>) ?? {}) };
    if (data.value === null) delete map[data.key];
    else map[data.key] = data.value;
    config[field] = map;
    const aud = { ...((config["audience"] as Record<string, string>) ?? {}) };
    const audKey = `${data.kind}:${data.key}`;
    if (data.value === null || data.audience === "all") delete aud[audKey];
    else aud[audKey] = data.audience;
    config["audience"] = aud;
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: config as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

export const setPageEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        path: z
          .string()
          .regex(/^\/[a-zA-Z0-9\-_/]*$/)
          .max(200),
        enabled: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    if (data.path === "/" || data.path === "/compte" || data.path === "/administration")
      throw new Error("Cette page est protégée pour préserver l’accès au site et à l’administration.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error || !current.data) throw new Error("Lecture impossible.");
    const config = { ...((current.data.config as Record<string, unknown>) ?? {}) };
    const disabled = new Set(Array.isArray(config["disabledPages"]) ? (config["disabledPages"] as string[]) : []);
    const permanentlyDeleted = new Set(
      Array.isArray(config["permanentlyDeletedPages"]) ? (config["permanentlyDeletedPages"] as string[]) : [],
    );
    if (data.enabled && permanentlyDeleted.has(data.path))
      throw new Error("Cette page a été supprimée pour de bon et ne peut plus être restaurée depuis l’éditeur.");
    if (data.enabled) disabled.delete(data.path);
    else disabled.add(data.path);
    config["disabledPages"] = [...disabled];
    config["editHistory"] = recordEdit(
      config,
      `${data.enabled ? "Restauration" : "Suppression"} de page — ${data.path}`,
    );
    const { error } = await context.supabase.from("business_settings").upsert({
      id: "main",
      config: config as Json,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Enregistrement de la page impossible.");
    return { ok: true, disabledPages: [...disabled] };
  });

export const permanentlyDeletePage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        path: z
          .string()
          .regex(/^\/[a-zA-Z0-9\-_/]*$/)
          .max(200),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    if (["/", "/compte", "/administration", "/connexion", "/inscription"].includes(data.path))
      throw new Error("Cette page est protégée.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error || !current.data) throw new Error("Lecture impossible.");
    const config = { ...((current.data.config as Record<string, unknown>) ?? {}) };
    const disabled = new Set(Array.isArray(config["disabledPages"]) ? (config["disabledPages"] as string[]) : []);
    if (!disabled.has(data.path)) throw new Error("Désactive d’abord cette page dans « Gérer les pages ».");
    const deleted = new Set(
      Array.isArray(config["permanentlyDeletedPages"]) ? (config["permanentlyDeletedPages"] as string[]) : [],
    );
    deleted.add(data.path);
    config["permanentlyDeletedPages"] = [...deleted];
    config["editHistory"] = recordEdit(config, "Suppression définitive de page — " + data.path);
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: config as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Suppression définitive impossible.");
    return { ok: true, permanentlyDeletedPages: [...deleted] };
  });
export const permanentlyDeleteHidden = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ key: z.string().min(1).max(2000) }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error || !current.data) throw new Error("Lecture impossible.");
    const config = { ...(current.data.config as Record<string, unknown>) };
    const hidden = { ...((config["hidden"] as Record<string, string>) ?? {}) };
    if (hidden[data.key] === undefined) throw new Error("Cet élément n’est plus dans la liste des suppressions.");
    const permanentHidden = { ...((config["permanentHidden"] as Record<string, boolean>) ?? {}), [data.key]: true };
    const audience = { ...((config["audience"] as Record<string, string>) ?? {}) };
    delete audience[`hide:${data.key}`];
    config["permanentHidden"] = permanentHidden;
    config["audience"] = audience;
    const { error } = await context.supabase.from("business_settings").upsert({
      id: "main",
      config: config as Json,
      updated_at: new Date().toISOString(),
    });
    if (error) throw new Error("Suppression définitive impossible.");
    return { ok: true };
  });

export const restoreEditorHistory = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.string().uuid().parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error) throw new Error("Lecture impossible.");
    const config = { ...((current.data?.config as Record<string, unknown>) ?? {}) };
    const history = editHistorySchema.parse(config["editHistory"] ?? []);
    const entry = history.find((item) => item.id === data);
    if (!entry) throw new Error("Cette modification n’est plus dans l’historique.");
    const restored = configSchema.parse({
      ...defaultConfig,
      ...config,
      ...Object.fromEntries(editFields.map((field) => [field, entry.state[field] ?? {}])),
    });
    config["editHistory"] = historyBefore(history, data);
    for (const field of editFields) config[field] = restored[field];
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: config as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Restauration impossible.");
    return { ok: true };
  });

export const uploadSiteImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        type: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm", "video/quicktime"]),
        base64: z.string().max(28000000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const binary = Uint8Array.from(atob(data.base64), (c) => c.charCodeAt(0));
    const isVideo = data.type.startsWith("video/");
    const maxBytes = (isVideo ? 20 : 5) * 1024 * 1024;
    if (binary.length > maxBytes) {
      throw new Error(
        isVideo
          ? "Vidéo refusée : taille maximale autorisée de 20 Mo."
          : "Photo refusée : taille maximale autorisée de 5 Mo.",
      );
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const extension = data.type === "video/quicktime" ? "mov" : data.type.split("/")[1];
    const path = `${crypto.randomUUID()}.${extension}`;
    const r = await supabaseAdmin.storage.from("site-images").upload(path, binary, { contentType: data.type });
    if (r.error) throw new Error("Envoi du fichier impossible.");
    return { url: `/api/public/site-image/${path}` };
  });

export const checkDiscount = createServerFn({ method: "POST" })
  .inputValidator((input) => z.string().max(40).parse(input))
  .handler(async ({ data }) => {
    const code = normalizeCode(data);
    if (!codePattern.test(code)) return { valid: false as const };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const d = await supabaseAdmin.from("discount_codes").select("*").eq("code", code).maybeSingle();
    if (d.error) throw new Error("Vérification impossible.");
    return promoIsAvailable(d.data)
      ? { valid: true as const, code, percent: Number(d.data.percent), ends_at: d.data.ends_at }
      : { valid: false as const };
  });

// eslint-disable-next-line @typescript-eslint/no-explicit-any
const isAdmin = async (ctx: { supabase: any; userId: string }) => {
  const r = await ctx.supabase.rpc("has_role", { _user_id: ctx.userId, _role: "admin" });
  if (!r.data) throw new Error("Accès administrateur requis.");
};

export const listDiscounts = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await isAdmin(context);
    const { data, error } = await context.supabase
      .from("discount_codes")
      .select("*")
      .order("created_at", { ascending: false });
    if (error) throw new Error("Lecture impossible.");
    return data ?? [];
  });

export const saveDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => promoInputSchema.parse(input))
  .handler(async ({ data, context }) => {
    await isAdmin(context);
    const { error } = await context.supabase.from("discount_codes").upsert(data);
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

export const deleteDiscount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.string().max(40).parse(input))
  .handler(async ({ data, context }) => {
    await isAdmin(context);
    const { error } = await context.supabase.from("discount_codes").delete().eq("code", data);
    if (error) throw new Error("Suppression impossible.");
    return { ok: true };
  });

export const getReviews = createServerFn({ method: "GET" }).handler(async () => {
  const key = process.env["SUPABASE_PUBLISHABLE_KEY"]!;
  const client = createClient<Database>(process.env["SUPABASE_URL"]!, key, {
    auth: { persistSession: false },
    global: {
      fetch: (input, init) => {
        const h = new Headers(init?.headers);
        if (key.startsWith("sb_") && h.get("Authorization") === `Bearer ${key}`) h.delete("Authorization");
        h.set("apikey", key);
        return fetch(input, { ...init, headers: h });
      },
    },
  });
  const { data, error } = await client
    .from("reviews")
    .select("id,author,rating,comment,photo,created_at")
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) throw new Error("Avis indisponibles.");
  return data ?? [];
});

export const submitReview = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        author: z.string().trim().min(2).max(80),
        rating: z.number().int().min(1).max(5),
        comment: z.string().trim().max(1500),
        photo: z
          .object({ type: z.enum(["image/jpeg", "image/png", "image/webp"]), base64: z.string().max(7000000) })
          .nullable(),
        honeypot: z.string().max(100),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    if (data.honeypot) throw new Error("Avis non valide.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const req = getRequest();
    const ip = req.headers.get("cf-connecting-ip") ?? req.headers.get("x-forwarded-for")?.split(",")[0] ?? "unknown";
    const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`review:${ip}`));
    const k = Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
    const limit = await supabaseAdmin.rpc("consume_form_attempt", { _key: k });
    if (limit.error || !limit.data) throw new Error("Trop d’avis envoyés. Réessayez plus tard.");
    let photo = "";
    if (data.photo) {
      const binary = Uint8Array.from(atob(data.photo.base64), (c) => c.charCodeAt(0));
      if (binary.length > 5 * 1024 * 1024) throw new Error("La photo doit peser moins de 5 Mo.");
      const t = data.photo.type;
      const valid =
        (t === "image/jpeg" && binary[0] === 255 && binary[1] === 216) ||
        (t === "image/png" && binary[0] === 137 && binary[1] === 80) ||
        (t === "image/webp" && String.fromCharCode(...binary.slice(8, 12)) === "WEBP");
      if (!valid) throw new Error("Format de photo non valide.");
      const path = `${crypto.randomUUID()}.${t.split("/")[1]}`;
      const r = await supabaseAdmin.storage.from("site-images").upload(path, binary, { contentType: t });
      if (r.error) throw new Error("Envoi de la photo impossible.");
      photo = `/api/public/site-image/${path}`;
    }
    const { error } = await supabaseAdmin
      .from("reviews")
      .insert({ author: data.author, rating: data.rating, comment: data.comment, photo });
    if (error) throw new Error("Votre avis n’a pas pu être enregistré.");
    return { ok: true };
  });

export const deleteReview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.string().uuid().parse(input))
  .handler(async ({ data, context }) => {
    await isAdmin(context);
    const { error } = await context.supabase.from("reviews").delete().eq("id", data);
    if (error) throw new Error("Suppression impossible.");
    return { ok: true };
  });

// ----- Espace client : profil, notifications, messagerie -----
export const profileComplete = (
  p: { full_name: string; phone: string; address: string; postal_code: string; city: string } | null,
) => !!(p && p.full_name.trim() && p.phone.trim() && p.address.trim() && p.postal_code.trim() && p.city.trim());

export const getClientData = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const [profile, requests, notifications] = await Promise.all([
      context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle(),
      supabaseAdmin
        .from("quote_requests")
        .select("id,kind,status,amount,created_at,details")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
      context.supabase
        .from("client_notifications")
        .select("*")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(50),
    ]);
    const reqList = requests.data ?? [];
    const requestIds = reqList.map((r) => r.id);
    const messages = requestIds.length
      ? await supabaseAdmin
          .from("request_messages")
          .select("*")
          .in("request_id", requestIds)
          .eq("hidden_for_client", false)
          .order("created_at")
          .limit(500)
      : { data: [] };

    return {
      profile: profile.data ?? null,
      requests: reqList,
      notifications: notifications.data ?? [],
      messages: messages.data ?? [],
    };
  });

/** Hides messages for the signed-in client only; the admin still sees them. */
export const hideClientMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const own = await supabaseAdmin.from("quote_requests").select("id").eq("user_id", context.userId);
    const ownIds = (own.data ?? []).map((r) => r.id);
    if (!ownIds.length) return { ok: true };
    const { error } = await supabaseAdmin
      .from("request_messages")
      .update({ hidden_for_client: true })
      .in("id", data.ids)
      .in("request_id", ownIds);
    if (error) throw new Error("Suppression impossible.");
    return { ok: true };
  });

const photoInput = z.object({
  type: z.enum(["image/jpeg", "image/png", "image/webp"]),
  base64: z.string().max(7000000),
});

export const saveProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        full_name: z.string().trim().max(80),
        phone: z.string().trim().max(20),
        address: z.string().trim().max(200),
        postal_code: z.string().trim().max(10),
        city: z.string().trim().max(80),
        photo: photoInput.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    let photoPath: string | undefined;
    if (data.photo) {
      const binary = Uint8Array.from(atob(data.photo.base64), (c) => c.charCodeAt(0));
      if (binary.length > 5 * 1024 * 1024) throw new Error("La photo doit peser moins de 5 Mo.");
      photoPath = `${context.userId}/profil.${data.photo.type.split("/")[1]}`;
      const up = await context.supabase.storage
        .from("client-media")
        .upload(photoPath, binary, { contentType: data.photo.type, upsert: true });
      if (up.error) throw new Error("Envoi de la photo impossible.");
    }
    const row = {
      id: context.userId,
      full_name: data.full_name,
      phone: data.phone,
      address: data.address,
      postal_code: data.postal_code,
      city: data.city,
      ...(photoPath ? { photo_path: photoPath } : {}),
      updated_at: new Date().toISOString(),
    };
    const { error } = await context.supabase.from("profiles").upsert(row);
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

export const getUnreadCount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { count } = await context.supabase
      .from("client_notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", context.userId)
      .is("read_at", null);
    return count ?? 0;
  });

export const markNotificationsRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await context.supabase
      .from("client_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .is("read_at", null);
    return { ok: true };
  });

/** Mark messages in a conversation as read by the authenticated recipient. */
export const markMessagesRead = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ request_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (role.data) {
      const { error } = await supabaseAdmin
        .from("request_messages")
        .update({ read_at: new Date().toISOString() })
        .eq("request_id", data.request_id)
        .eq("is_admin", false)
        .is("read_at", null);
      if (error) throw new Error("Impossible de mettre à jour la lecture des messages.");
      return { ok: true };
    }

    const own = await supabaseAdmin
      .from("quote_requests")
      .select("id")
      .eq("id", data.request_id)
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!own.data) throw new Error("Conversation introuvable.");
    const { error } = await supabaseAdmin
      .from("request_messages")
      .update({ read_at: new Date().toISOString() })
      .eq("request_id", data.request_id)
      .eq("is_admin", true)
      .is("read_at", null);
    if (error) throw new Error("Impossible de mettre à jour la lecture des messages.");
    await context.supabase
      .from("client_notifications")
      .update({ read_at: new Date().toISOString() })
      .eq("user_id", context.userId)
      .eq("request_id", data.request_id)
      .is("read_at", null);
    return { ok: true };
  });
const mediaInput = z.object({
  type: z.enum(["image/jpeg", "image/png", "image/webp", "video/mp4", "video/webm"]),
  base64: z.string().max(28000000),
});

const uploadMedia = async (
  supabase: {
    storage: {
      from: (b: string) => {
        upload: (p: string, b: Uint8Array, o: { contentType: string }) => Promise<{ error: unknown }>;
      };
    };
  },
  folder: string,
  media: { type: string; base64: string },
) => {
  const binary = Uint8Array.from(atob(media.base64), (c) => c.charCodeAt(0));
  if (binary.length > 20 * 1024 * 1024) throw new Error("Le fichier doit peser moins de 20 Mo.");
  const path = `${folder}/${crypto.randomUUID()}.${media.type.split("/")[1]}`;
  const r = await supabase.storage.from("client-media").upload(path, binary, { contentType: media.type });
  if (r.error) throw new Error("Envoi du fichier impossible.");
  return path;
};

async function sendMessageAlert(details: {
  customer_name: string;
  phone?: string | null;
  email?: string | null;
  request_id: string;
  body: string;
  attachment?: { name: string; type: string } | null;
  file?: AlertFile | null;
}) {
  const LOVABLE_API_KEY = process.env["LOVABLE_API_KEY"];
  const GMAIL_KEY = process.env["GOOGLE_MAIL_API_KEY"];
  if (!LOVABLE_API_KEY || !GMAIL_KEY) return;
  const to = process.env["ALERT_EMAIL"] || "contact@tclean-nettoyage.fr";

  const b64 = (s: string) => btoa(Array.from(new TextEncoder().encode(s), (b) => String.fromCharCode(b)).join(""));
  const header = (v: string) => (/^[\x00-\x7F]*$/.test(v) ? v : `=?UTF-8?B?${b64(v)}?=`);

  const lines: string[] = [
    "💬 NOUVEAU MESSAGE CLIENT - TCLEAN",
    `Dossier / Réf : #${details.request_id.slice(0, 8)}`,
    "--------------------------------------------------",
    "",
    "👤 EXPÉDITEUR :",
    `• Nom : ${details.customer_name}`,
    `• Téléphone : ${details.phone || "Non renseigné"}`,
    `• E-mail : ${details.email || "Non renseigné"}`,
    "",
    "📩 MESSAGE DU CLIENT :",
    details.body ? `"${details.body}"` : "(Message sans texte)",
    "",
  ];

  if (details.attachment) {
    const isVideo = details.attachment.type.startsWith("video/");
    lines.push(
      "📎 PIÈCE JOINTE REÇUE :",
      `• Type : ${isVideo ? "Vidéo" : "Photo / Image"} (${details.attachment.type})`,
      `• Nom du fichier : ${details.attachment.name}`,
      "• Visible dans votre espace administration TClean (onglet Messages)",
      "",
    );
  }

  const text = lines.filter((l) => l !== "").join("\n");
  const subject = `[TClean] Nouveau message de ${details.customer_name}`;

  const raw = buildAlertMime(to, header(subject), text, details.file ? [details.file] : []);
  await fetch("https://connector-gateway.lovable.dev/google_mail/gmail/v1/users/me/messages/send", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${LOVABLE_API_KEY}`,
      "X-Connection-Api-Key": GMAIL_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ raw }),
  }).catch((e) => console.error("Alerte e-mail échouée", e));
}

export const sendClientMessage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        request_id: z.string().uuid().optional(),
        body: z.string().trim().max(2000),
        attachment: mediaInput.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    if (!data.body && !data.attachment) throw new Error("Écrivez un message ou joignez un fichier.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let requestId = data.request_id;

    if (!requestId) {
      const existing = await supabaseAdmin
        .from("quote_requests")
        .select("id")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (existing.data?.id) {
        requestId = existing.data.id;
      } else {
        const prof = await context.supabase.from("profiles").select("*").eq("id", context.userId).maybeSingle();
        const userRes = await context.supabase.auth.getUser();
        const ins = await supabaseAdmin
          .from("quote_requests")
          .insert({
            user_id: context.userId,
            kind: "contact",
            customer_name: prof.data?.full_name || "Client",
            email: userRes.data.user?.email || "",
            phone: prof.data?.phone || "",
            city: prof.data?.city || "Strasbourg",
            address: prof.data?.address || "",
            postal_code: prof.data?.postal_code || "67000",
            status: "pending",
            details: { channel: "messenger" },
          })
          .select("id")
          .single();

        if (ins.error || !ins.data) throw new Error("Création de la conversation impossible.");
        requestId = ins.data.id;
      }
    } else {
      const req = await supabaseAdmin.from("quote_requests").select("id,user_id").eq("id", requestId).single();
      if (req.error || !req.data || req.data.user_id !== context.userId) throw new Error("Demande introuvable.");
    }

    const attachment = data.attachment ? await uploadMedia(context.supabase, context.userId, data.attachment) : "";
    const { error } = await supabaseAdmin
      .from("request_messages")
      .insert({ request_id: requestId, sender_id: context.userId, is_admin: false, body: data.body, attachment });
    if (error) throw new Error("Message non envoyé.");

    const prof = await context.supabase
      .from("profiles")
      .select("full_name,phone")
      .eq("id", context.userId)
      .maybeSingle();
    const userRes = await context.supabase.auth.getUser();
    const reqData = await supabaseAdmin
      .from("quote_requests")
      .select("customer_name,phone,email")
      .eq("id", requestId)
      .maybeSingle();

    await sendMessageAlert({
      customer_name: prof.data?.full_name || reqData.data?.customer_name || "Client",
      phone: prof.data?.phone || reqData.data?.phone || "",
      email: userRes.data.user?.email || reqData.data?.email || "",
      request_id: requestId,
      body: data.body,
      attachment: data.attachment
        ? { name: attachment.split("/").pop() || "fichier", type: data.attachment.type }
        : null,
      file: data.attachment ? { type: data.attachment.type, base64: data.attachment.base64 } : null,
    }).catch((e) => console.error("Alerte e-mail échouée", e));

    return { ok: true };
  });

export const adminReply = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        request_id: z.string().uuid(),
        body: z.string().trim().min(1).max(2000),
        attachment: mediaInput.nullable(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    await isAdmin(context);
    const req = await context.supabase
      .from("quote_requests")
      .select("id,user_id,customer_name")
      .eq("id", data.request_id)
      .single();
    if (req.error || !req.data) throw new Error("Demande introuvable.");
    const attachment = data.attachment
      ? await uploadMedia(context.supabase, req.data.user_id ?? context.userId, data.attachment)
      : "";
    const { error } = await context.supabase
      .from("request_messages")
      .insert({ request_id: data.request_id, sender_id: context.userId, is_admin: true, body: data.body, attachment });
    if (error) throw new Error("Message non envoyé.");
    if (req.data.user_id)
      await context.supabase.from("client_notifications").insert({
        user_id: req.data.user_id,
        request_id: data.request_id,
        title: "Nouveau message de TClean",
        body: `Bonjour ${req.data.customer_name}, vous avez reçu une réponse de notre part dans votre espace client. — L’équipe TClean`,
      });
    return { ok: true };
  });

export const askTcleanBot = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        request_id: z.string().uuid().optional(),
        question: z.string().trim().min(2).max(500),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profile = await context.supabase.from("profiles").select("full_name").eq("id", context.userId).maybeSingle();
    const user = await context.supabase.auth.getUser();
    let requestId = data.request_id;

    if (requestId) {
      const owned = await supabaseAdmin
        .from("quote_requests")
        .select("id,kind,status,user_id")
        .eq("id", requestId)
        .eq("user_id", context.userId)
        .maybeSingle();
      if (!owned.data) throw new Error("Conversation introuvable.");
    } else {
      const existing = await supabaseAdmin
        .from("quote_requests")
        .select("id,kind,status,user_id")
        .eq("user_id", context.userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (existing.data?.id) {
        requestId = existing.data.id;
      } else {
        const created = await supabaseAdmin
          .from("quote_requests")
          .insert({
            user_id: context.userId,
            kind: "contact",
            customer_name: profile.data?.full_name || "Client",
            email: user.data.user?.email || "",
            phone: "",
            city: "Strasbourg",
            postal_code: "67000",
            address: "",
            status: "pending",
            details: { channel: "messenger" },
          })
          .select("id")
          .single();
        if (created.error || !created.data) throw new Error("Création de la conversation impossible.");
        requestId = created.data.id;
      }
    }

    if (!requestId) throw new Error("Impossible de préparer la conversation.");
    const [request, recent] = await Promise.all([
      supabaseAdmin.from("quote_requests").select("kind,status,details").eq("id", requestId).single(),
      supabaseAdmin
        .from("request_messages")
        .select("is_admin,is_bot,body")
        .eq("request_id", requestId)
        .order("created_at", { ascending: false })
        .limit(8),
    ]);
    const history = (recent.data ?? [])
      .reverse()
      .map((m) => `${m.is_bot ? "Bot TClean" : m.is_admin ? "Équipe TClean" : "Client"} : ${m.body}`)
      .join("\n");
    const { botChatReply } = await import("./tclean-bot.server");
    const answer = await botChatReply({
      question: data.question,
      customerName: profile.data?.full_name || "Client",
      context: `Type de demande : ${request.data?.kind ?? "contact"}. Statut actuel : ${request.data?.status ?? "non précisé"}. Historique récent :\n${history}`,
    });
    const { error } = await supabaseAdmin.from("request_messages").insert({
      request_id: requestId,
      sender_id: context.userId,
      is_admin: true,
      is_bot: true,
      body: answer,
      attachment: "",
    });
    if (error) throw new Error("Réponse du bot impossible à enregistrer.");
    return { ok: true, request_id: requestId };
  });
export const askPublicTcleanBot = createServerFn({ method: "POST" })
  .inputValidator((input) =>
    z
      .object({
        question: z.string().trim().min(1).max(600),
        history: z
          .array(
            z.object({
              role: z.enum(["bot", "user"]),
              text: z.string().max(1000),
            }),
          )
          .max(20)
          .optional(),
      })
      .parse(input),
  )
  .handler(async ({ data }) => {
    const { botChatReply } = await import("./tclean-bot.server");
    const historyText = (data.history || [])
      .slice(-6)
      .map((m) => `${m.role === "user" ? "Client" : "TClean Bot"}: ${m.text}`)
      .join("\n");
    const answer = await botChatReply({
      question: data.question,
      customerName: "Visiteur du site",
      context: historyText || "Discussion en direct sur la page d'accueil de tclean-nettoyage.fr",
    });
    return { answer };
  });
export const getMediaUrl = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.string().max(300).parse(input))
  .handler(async ({ data, context }) => {
    const admin = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!admin.data && !data.startsWith(`${context.userId}/`)) throw new Error("Accès au fichier refusé.");
    const { data: result, error } = await context.supabase.storage.from("client-media").createSignedUrl(data, 300);
    if (error) throw new Error("Fichier inaccessible.");
    return result.signedUrl;
  });

export const deleteRequests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1).max(500) }).parse(input))
  .handler(async ({ data, context }) => {
    await isAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await supabaseAdmin.from("quote_requests").select("id,attachments").in("id", data.ids);
    const msgs = await supabaseAdmin.from("request_messages").select("attachment").in("request_id", data.ids);
    await supabaseAdmin.from("client_notifications").delete().in("request_id", data.ids);
    await supabaseAdmin.from("request_messages").delete().in("request_id", data.ids);
    const { error } = await supabaseAdmin.from("quote_requests").delete().in("id", data.ids);
    if (error) throw new Error("Suppression impossible.");
    const photos = (rows.data ?? []).flatMap((r) => (Array.isArray(r.attachments) ? (r.attachments as string[]) : []));
    if (photos.length) await supabaseAdmin.storage.from("quote-photos").remove(photos);
    const media = (msgs.data ?? []).map((m) => m.attachment).filter(Boolean);
    if (media.length) await supabaseAdmin.storage.from("client-media").remove(media);
    return { deleted: data.ids.length };
  });

export const deleteMessages = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ ids: z.array(z.string().uuid()).min(1).max(1000) }).parse(input))
  .handler(async ({ data, context }) => {
    await isAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const msgs = await supabaseAdmin.from("request_messages").select("attachment").in("id", data.ids);
    const { error } = await supabaseAdmin.from("request_messages").delete().in("id", data.ids);
    if (error) throw new Error("Suppression impossible.");
    const media = (msgs.data ?? []).map((m) => m.attachment).filter(Boolean);
    if (media.length) await supabaseAdmin.storage.from("client-media").remove(media);
    return { deleted: data.ids.length };
  });

async function assertAdmin(context: { supabase: { rpc: (...a: never[]) => unknown }; userId: string }) {
  const role = await (context.supabase.rpc as unknown as (n: string, a: object) => Promise<{ data: boolean | null }>)(
    "has_role",
    { _user_id: context.userId, _role: "admin" },
  );
  if (!role.data) throw new Error("Accès réservé aux administrateurs.");
}

async function allUsers() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const users: { id: string; email: string; verified: boolean }[] = [];
  for (let page = 1; page <= 20; page++) {
    const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Lecture des comptes impossible.");
    users.push(...data.users.map((u) => ({ id: u.id, email: u.email ?? "", verified: Boolean(u.email_confirmed_at) })));
    if (data.users.length < 1000) break;
  }
  return users;
}

export const listAdmins = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const roles = await supabaseAdmin.from("user_roles").select("user_id").eq("role", "admin");
    const ids = new Set((roles.data ?? []).map((r) => r.user_id));
    const users = await allUsers();
    return { me: context.userId, admins: users.filter((u) => ids.has(u.id)) };
  });

export const addAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ email: z.string().trim().toLowerCase().email().max(200) }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    const user = (await allUsers()).find((u) => u.email.toLowerCase() === data.email);
    if (!user)
      throw new Error("Aucun compte avec cette adresse. La personne doit d’abord créer un compte sur le site.");
    if (!user.verified)
      throw new Error(
        "Cette adresse e-mail n’a pas encore été confirmée. La personne doit d’abord valider son compte.",
      );
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("user_roles")
      .upsert({ user_id: user.id, role: "admin" }, { onConflict: "user_id,role" });
    if (error) throw new Error("Ajout impossible.");
    return { ok: true };
  });

export const removeAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ user_id: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context as never);
    if (data.user_id === context.userId) throw new Error("Vous ne pouvez pas retirer votre propre accès.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("user_roles").delete().eq("user_id", data.user_id).eq("role", "admin");
    if (error) throw new Error("Retrait impossible.");
    return { ok: true };
  });

export const clearSiteColors = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error) throw new Error("Lecture impossible.");
    const config = { ...((current.data?.config as Record<string, unknown>) ?? {}) };
    delete config["themeColors"];
    delete config["elementColors"];
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: config as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });

export const updateButtonLink = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ key: z.string().min(1).max(2000), target: z.string().min(1).max(200) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error) throw new Error("Lecture impossible.");
    const config = { ...((current.data?.config as Record<string, unknown>) ?? {}) };
    const links = { ...((config["links"] as Record<string, string>) ?? {}) };
    links[data.key] = data.target;
    config["links"] = links;
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: config as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true };
  });
// Alias compatibles pour le composant site-editor.tsx
export const saveSiteColor = saveSiteColors;
export const saveSiteSetting = saveOverride;
export const setRouletteEnabled = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ enabled: z.boolean() }).parse(input))
  .handler(async ({ data, context }) => {
    const role = await context.supabase.rpc("has_role", { _user_id: context.userId, _role: "admin" });
    if (!role.data) throw new Error("Accès administrateur requis.");
    const current = await context.supabase.from("business_settings").select("config").eq("id", "main").maybeSingle();
    if (current.error) throw new Error("Lecture impossible.");
    const config = { ...((current.data?.config as Record<string, unknown>) ?? {}) };
    config["rouletteEnabled"] = data.enabled;
    const { error } = await context.supabase
      .from("business_settings")
      .upsert({ id: "main", config: config as Json, updated_at: new Date().toISOString() });
    if (error) throw new Error("Enregistrement impossible.");
    return { ok: true, enabled: data.enabled };
  });
