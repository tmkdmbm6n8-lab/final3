// Envoi de SMS via GatewayAPI (connecteur Lovable). Inactif tant que la connexion n'est pas liée.
const GATEWAY_URL = "https://connector-gateway.lovable.dev/gatewayapi";

/** Convertit un numéro français en MSISDN international (ex. 0612345678 -> 33612345678). */
export function toMsisdn(phone: string): number | null {
  let d = phone.replace(/[^\d+]/g, "");
  if (d.startsWith("+")) d = d.slice(1);
  else if (d.startsWith("00")) d = d.slice(2);
  else if (d.startsWith("0") && d.length === 10) d = "33" + d.slice(1);
  if (!/^\d{8,15}$/.test(d)) return null;
  return Number(d);
}

export async function sendSms(phone: string, message: string, reference?: string): Promise<boolean> {
  const lovableKey = process.env['LOVABLE_API_KEY'];
  const smsKey = process.env['GATEWAYAPI_API_KEY'];
  if (!lovableKey || !smsKey) {
    console.warn("SMS non envoyé : GatewayAPI n'est pas encore connecté.");
    return false;
  }
  const recipient = toMsisdn(phone);
  if (!recipient) {
    console.warn("SMS non envoyé : numéro invalide.");
    return false;
  }
  const res = await fetch(`${GATEWAY_URL}/mobile/single`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${lovableKey}`,
      "X-Connection-Api-Key": smsKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ sender: "TClean", recipient, message: message.slice(0, 600), reference }),
  });
  if (!res.ok) {
    console.error(`SMS échoué [${res.status}]: ${await res.text()}`);
    return false;
  }
  return true;
}

/** Envoie la confirmation au client et l'alerte à l'administrateur. Ne lève jamais d'erreur. */
export async function sendBookingSms(p: { id: string; customer_name: string; phone: string; slotTime: string | null; city: string }) {
  const ref = p.id.slice(0, 8).toUpperCase();
  const when = p.slotTime || "date à convenir";
  const adminPhone = process.env['ADMIN_SMS_PHONE'] || "0744881170";
  await Promise.allSettled([
    sendSms(p.phone, `TClean : bonjour ${p.customer_name}, votre réservation du ${when} est confirmée. Réf. ${ref}. Contact : 07 44 88 11 70`, ref),
    sendSms(adminPhone, `Nouvelle réservation TClean ${ref} : ${p.customer_name}, ${p.phone}, ${p.city}, ${when}.`, ref),
  ]).catch(() => {});
}
