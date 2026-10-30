import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { createStripeClient, getStripeErrorMessage } from "@/lib/stripe.server";

const ALLOWED_RETURN_ORIGINS = [
  "https://tclean-nettoyage.fr",
  "https://www.tclean-nettoyage.fr",
  "https://clean-sparkle-strasbourg.lovable.app",
  "https://id-preview--c69425cb-1005-53f9-8742-0c087a259a1c.lovable.app",
  "http://localhost:8080",
];

// Only same-site return pages are accepted; anything else falls back to the official site.
function safeReturnUrl(input: string) {
  const fallback = "https://tclean-nettoyage.fr/paiement/retour?session_id={CHECKOUT_SESSION_ID}";
  try {
    const url = new URL(input.replace("{CHECKOUT_SESSION_ID}", "SESSIONPLACEHOLDER"));
    if (!ALLOWED_RETURN_ORIGINS.includes(url.origin) || url.pathname !== "/paiement/retour") return fallback;
    return `${url.origin}/paiement/retour?session_id={CHECKOUT_SESSION_ID}`;
  } catch {
    return fallback;
  }
}

// The amount is always read from the stored request (computed server-side), never from the browser.
export const createRequestCheckout = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        requestId: z.string().uuid(),
        returnUrl: z.string().url().max(500),
        environment: z.enum(["sandbox", "live"]),
      })
      .parse(input),
  )
  .handler(async ({ data, context }): Promise<{ clientSecret: string } | { error: string }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: settings } = await supabaseAdmin
      .from("business_settings")
      .select("config")
      .eq("id", "main")
      .maybeSingle();
    const config =
      settings?.config && typeof settings.config === "object" && !Array.isArray(settings.config)
        ? (settings.config as Record<string, unknown>)
        : {};
    if (config["cardPaymentEnabled"] !== true) {
      return { error: "Le paiement par carte bancaire est désactivé par TClean." };
    }
    const { data: row } = await supabaseAdmin
      .from("quote_requests")
      .select("id,amount,email,payment_method,payment_status,created_at,user_id")
      .eq("id", data.requestId)
      .maybeSingle();
    if (!row || row.user_id !== context.userId)
      return { error: "Connectez-vous avec le compte qui a fait la réservation pour payer en ligne." };
    if (row.payment_method !== "online" || row.payment_status === "paid" || row.amount === null)
      return { error: "Cette réservation ne peut pas être payée en ligne." };
    if (Date.now() - new Date(row.created_at).getTime() > 24 * 3600 * 1000)
      return { error: "Le délai de paiement en ligne est dépassé. Contactez TClean." };
    try {
      const stripe = createStripeClient(data.environment);
      const prices = await stripe.prices.list({ lookup_keys: ["tclean_prestation_base"] });
      const base = prices.data[0];
      if (!base) throw new Error("Produit de paiement introuvable.");
      const productId = typeof base.product === "string" ? base.product : base.product.id;
      const session = await stripe.checkout.sessions.create({
        line_items: [
          {
            price_data: {
              currency: "eur",
              product: productId,
              unit_amount: Math.round(Number(row.amount) * 100),
              tax_behavior: "inclusive",
            },
            quantity: 1,
          },
        ],
        mode: "payment",
        ui_mode: "embedded_page",
        return_url: safeReturnUrl(data.returnUrl),
        customer_email: row.email,
        automatic_tax: { enabled: true },
        payment_intent_data: { description: "Prestation de nettoyage TClean", metadata: { requestId: row.id } },
        metadata: { requestId: row.id, managed_payments: "false" },
      });
      return { clientSecret: session.client_secret ?? "" };
    } catch (error) {
      return { error: getStripeErrorMessage(error) };
    }
  });
