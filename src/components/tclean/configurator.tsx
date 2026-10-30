import { RouletteWheel } from "./roulette-wheel";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Link, useSearch } from "@tanstack/react-router";
import { ArrowLeft, ArrowRight, CheckCircle2, Phone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessQuery } from "@/lib/business-query";
import { telephone } from "@/lib/business";
import { checkDiscount, getClientData, getSlots, profileComplete, submitRequest } from "@/lib/business.functions";
import { ACCOUNT_DISCOUNT, PROFILE_DISCOUNT, applyDiscount, totalPercent } from "@/lib/discounts";
import { promoRemainingLabel } from "@/lib/promo-codes";
import { supabase } from "@/integrations/supabase/client";
import { paymentsConfigured } from "@/lib/stripe";
import { geocodeAddress, haversineKm } from "@/lib/configurator";
import { RequestCheckout } from "./checkout";
import {
  FREE_RADIUS_KM,
  armLabels,
  availableTypes,
  colors,
  defaultConfiguration,
  fabrics,
  forType,
  furnitureTypes,
  priceConfiguration,
  soilLabels,
  summarize,
  typeInfo,
  type Configuration,
} from "@/lib/configurator";
import { FurniturePhoto } from "./furniture-photo";
import { BookingCalendar } from "./booking-calendar";
const steps = ["Mobilier", "Forme", "Tissu", "Couleur", "Avant / après", "État", "Estimation", "Réservation"];
const DRAFT_KEY = "tclean-configurator-draft";
type ConfiguratorDraft = {
  cfg?: Configuration;
  step?: number;
  address?: string;
  form?: Partial<Record<"customer_name" | "phone" | "email" | "postal_code" | "city" | "message", string>>;
  slotId?: string;
  payment?: "onsite" | "online";
  savedAt?: number;
};
const DRAFT_TTL_MS = 10 * 60 * 1000;
function readDraft(): ConfiguratorDraft | null {
  try {
    const raw = window.localStorage.getItem(DRAFT_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as ConfiguratorDraft;
    if (!draft.savedAt || Date.now() - draft.savedAt > DRAFT_TTL_MS) {
      clearDraft();
      return null;
    }
    return draft;
  } catch {
    return null;
  }
}
function writeDraft(draft: ConfiguratorDraft) {
  try {
    window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    /* Le configurateur reste utilisable sans sauvegarde. */
  }
}
function clearDraft() {
  try {
    window.localStorage.removeItem(DRAFT_KEY);
  } catch {
    /* Rien à effacer si le stockage est indisponible. */
  }
}
function Compare({ cfg }: { cfg: Configuration }) {
  const [pos, setPos] = useState(50);
  return (
    <div className="cfg-compare">
      <FurniturePhoto cfg={cfg} dirty className="cfg-svg" />
      <div className="cfg-compare-after" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
        <FurniturePhoto cfg={cfg} className="cfg-svg" label="Après nettoyage, illustration indicative" />
      </div>
      <span className="cfg-tag left">Avant nettoyage</span>
      <span className="cfg-tag right">Après nettoyage — illustration indicative</span>
      <span className="cfg-handle" style={{ left: `${pos}%` }} aria-hidden="true" />
      <input
        type="range"
        min={0}
        max={100}
        value={pos}
        onChange={(e) => setPos(Number(e.target.value))}
        aria-label="Comparer avant et après nettoyage"
        className="cfg-range"
      />
    </div>
  );
}
export function Configurator() {
  const [initialDraft] = useState<ConfiguratorDraft | null>(() => (typeof window === "undefined" ? null : readDraft()));
  const { data: c } = useSuspenseQuery(businessQuery);
  const submit = useServerFn(submitRequest);
  const loadSlots = useServerFn(getSlots);
  const [slots, setSlots] = useState<Awaited<ReturnType<typeof getSlots>>>([]);
  const [slotsLoading, setSlotsLoading] = useState(true);
  const [slotId, setSlotId] = useState("");
  const [address, setAddress] = useState("");
  const [distanceKm, setDistanceKm] = useState<number | null>(null);
  const types = availableTypes(c);
  const { mobilier } = useSearch({ from: "/configurateur" });
  const restoreDraft = !!initialDraft?.cfg && (!mobilier || initialDraft.cfg.type === mobilier);
  useEffect(() => {
    const chosen = types.find((t) => t.id === mobilier);
    if (chosen && !restoreDraft) {
      setCfg(forType(defaultConfiguration, chosen.id));
      setStep(0);
    }
  }, [mobilier]);
  const [cfg, setCfg] = useState<Configuration>(() =>
    types.some((t) => t.id === "sofa3") || !types[0]
      ? defaultConfiguration
      : forType(defaultConfiguration, types[0].id),
  );
  const [step, setStep] = useState(0);
  const stepHeadingRef = useRef<HTMLHeadingElement>(null);
  const previousStep = useRef(step);
  const [form, setForm] = useState({
    customer_name: "",
    phone: "",
    email: "",
    postal_code: "",
    city: "",
    message: "",
    honeypot: "",
  });
  const [fieldError, setFieldError] = useState<{ key: "phone" | "email"; message: string } | null>(null);
  const invalidField = (key: "phone" | "email", message: string) => {
    setFieldError({ key, message });
    setError("");
    window.setTimeout(() => {
      const el = document.getElementById(`cf-${key}`);
      if (el) {
        el.focus();
        el.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }, 0);
  };
  const [files, setFiles] = useState<File[]>([]);
  const [consent, setConsent] = useState(false);
  const [error, setError] = useState("");
  const [availableCities, setAvailableCities] = useState<string[]>([]);
  const [cityLoading, setCityLoading] = useState(false);
  type AddressItem = { label: string; name: string; postcode: string; city: string };
  const [addressSuggestions, setAddressSuggestions] = useState<AddressItem[]>([]);
  const [addressLoading, setAddressLoading] = useState(false);
  const [showAddressDropdown, setShowAddressDropdown] = useState(false);
  const [locating, setLocating] = useState(false);
  const [locateError, setLocateError] = useState<string | null>(null);
  const handleLocateMe = () => {
    if (typeof window === "undefined" || !navigator.geolocation) {
      setLocateError("La géolocalisation n'est pas supportée par votre appareil.");
      return;
    }
    setLocating(true);
    setLocateError(null);

    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        try {
          const { latitude, longitude } = pos.coords;
          const res = await fetch(`https://api-adresse.data.gouv.fr/reverse/?lon=${longitude}&lat=${latitude}`);
          if (!res.ok) throw new Error("Erreur");
          const data = await res.json();
          const p = data.features?.[0]?.properties;

          if (p) {
            setAddress(p.name || p.street || p.label || "");
            setForm((prev) => ({
              ...prev,
              postal_code: p.postcode || prev.postal_code,
              city: p.city || prev.city,
            }));
            setShowAddressDropdown(false);
            setLocateError(null);
          } else {
            setLocateError("Aucune adresse trouvée à cet endroit.");
          }
        } catch {
          setLocateError("Impossible de récupérer l'adresse.");
        } finally {
          setLocating(false);
        }
      },
      (err) => {
        setLocating(false);
        if (err.code === 1) {
          setLocateError("Veuillez autoriser l'accès à la position sur votre appareil.");
        } else {
          setLocateError("Position introuvable.");
        }
      },
      { enableHighAccuracy: true, timeout: 10000 },
    );
  };
  useEffect(() => {
    if (address.trim().length < 3 || !showAddressDropdown) {
      setAddressSuggestions([]);
      return;
    }
    let active = true;
    const timer = window.setTimeout(async () => {
      setAddressLoading(true);
      try {
        const pcParam = /^\d{5}$/.test(form.postal_code) ? `&postcode=${form.postal_code}` : "";
        const res = await fetch(
          `https://api-adresse.data.gouv.fr/search/?q=${encodeURIComponent(address)}${pcParam}&limit=5&autocomplete=1`,
        );
        if (res.ok && active) {
          const data = await res.json();
          const items: AddressItem[] = (data.features || []).map((f: any) => ({
            label: f.properties?.label || "",
            name: f.properties?.name || f.properties?.label || "",
            postcode: f.properties?.postcode || "",
            city: f.properties?.city || "",
          }));
          setAddressSuggestions(items);
        }
      } catch {
        /* Ignorer en cas de déconnexion */
      } finally {
        if (active) setAddressLoading(false);
      }
    }, 280);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [address, form.postal_code, showAddressDropdown]);

  const selectAddress = (s: AddressItem) => {
    setAddress(s.name);
    setForm((prev) => ({
      ...prev,
      postal_code: s.postcode || prev.postal_code,
      city: s.city || prev.city,
    }));
    setShowAddressDropdown(false);
    setAddressSuggestions([]);
  };
  const handlePostalCodeChange = async (val: string) => {
    const cleaned = val.replace(/\D/g, "").slice(0, 5);
    setForm((prev) => ({ ...prev, postal_code: cleaned }));

    if (cleaned.length === 5) {
      setCityLoading(true);
      try {
        let cityFound = "";
        let names: string[] = [];

        // 1. Découpage officiel des communes
        const res = await fetch(`https://geo.api.gouv.fr/communes?codePostal=${cleaned}&fields=nom`);
        if (res.ok) {
          const communes = (await res.json()) as Array<{ nom: string }>;
          if (communes.length > 0) {
            names = communes.map((c) => c.nom);
            cityFound = names[0] ?? "";
          }
        }

        // 2. Secours sur l'API adresse nationale si nécessaire
        if (!cityFound) {
          const res2 = await fetch(`https://api-adresse.data.gouv.fr/search/?q=${cleaned}&type=municipality&limit=5`);
          if (res2.ok) {
            const data2 = await res2.json();
            const feats = data2.features || [];
            names = feats.map((f: any) => f.properties?.city || f.properties?.name).filter(Boolean);
            cityFound = names[0] || "";
          }
        }

        if (cityFound) {
          setAvailableCities(names);
          // Remplit la ville automatiquement dès 5 chiffres
          setForm((prev) => ({ ...prev, postal_code: cleaned, city: cityFound }));
        }
      } catch {
        /* En cas de coupure réseau */
      } finally {
        setCityLoading(false);
      }
    } else {
      setAvailableCities([]);
    }
  };
  useEffect(() => {
    let active = true;
    const refresh = () =>
      loadSlots()
        .then((rows) => {
          if (active) {
            setSlots(rows);
            setSlotId((current) => (rows.some((s) => s.id === current && s.available) ? current : ""));
          }
        })
        .catch(() => {
          if (active) setError("Les disponibilités n’ont pas pu être chargées.");
        })
        .finally(() => {
          if (active) setSlotsLoading(false);
        });
    refresh();
    const timer = setInterval(refresh, 15000);
    return () => {
      active = false;
      clearInterval(timer);
    };
  }, [loadSlots]);
  const [busy, setBusy] = useState(false);
  const [id, setId] = useState("");
  const [signedIn, setSignedIn] = useState(false);
  const [codeInput, setCodeInput] = useState("");
  const [code, setCode] = useState<{ code: string; percent: number; ends_at: string | null } | null>(null);
  const [promoRemaining, setPromoRemaining] = useState("");
  const [codeMsg, setCodeMsg] = useState("");
  const [payment, setPayment] = useState<"onsite" | "online">("onsite");
  const [payId, setPayId] = useState("");
  const check = useServerFn(checkDiscount);
  useEffect(() => {
    const endsAt = code?.ends_at;
    if (!endsAt) {
      setPromoRemaining("");
      return;
    }
    const tick = () => {
      const now = Date.now();
      if (now >= Date.parse(endsAt)) {
        setCode(null);
        setPromoRemaining("");
        setCodeMsg("Code expiré.");
        return;
      }
      setPromoRemaining(promoRemainingLabel(endsAt, now));
    };
    tick();
    const timer = window.setInterval(tick, 1000);
    return () => window.clearInterval(timer);
  }, [code]);
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSignedIn(!!data.session));
    const { data } = supabase.auth.onAuthStateChange((_e, s) => setSignedIn(!!s));
    return () => data.subscription.unsubscribe();
  }, []);
  const [profileDone, setProfileDone] = useState(false);
  const [rouletteState, setRouletteState] = useState<{
    played: boolean;
    won: boolean;
    lostBet: number;
  }>({ played: false, won: false, lostBet: 0 });
  const [isFirstOrder, setIsFirstOrder] = useState(true);
  const loadClient = useServerFn(getClientData);
  useEffect(() => {
    if (signedIn)
      loadClient()
        .then((d) => {
          const p = d.profile;
          setProfileDone(profileComplete(p));
          if (p) {
            setForm((f) => ({
              ...f,
              customer_name: f.customer_name || p.full_name,
              phone: f.phone || p.phone,
              postal_code: f.postal_code || p.postal_code,
              city: f.city || p.city,
            }));
            setAddress((a) => a || p.address);
          }
          supabase.auth.getUser().then(({ data: u }) => {
            const mail = u.user?.email;
            if (mail) setForm((f) => ({ ...f, email: f.email || mail }));
          });
        })
        .catch(() => {});
    else setProfileDone(false);
  }, [signedIn, loadClient]);
  useEffect(() => {
    if (previousStep.current === step) return;
    previousStep.current = step;
    const timer = window.setTimeout(() => {
      const heading = stepHeadingRef.current;
      if (!heading) return;
      const top = heading.getBoundingClientRect().top + window.scrollY - 100;
      window.scrollTo({ top: Math.max(0, top), behavior: "auto" });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [step]);
  useEffect(() => {
    if (id) {
      window.scrollTo({ top: 0, behavior: "smooth" });
    }
  }, [id]);
  useEffect(() => {
    try {
      window.sessionStorage.setItem(
        "tclean-configurator-quote",
        JSON.stringify({
          cfg,
          postal_code: form.postal_code,
          city: form.city,
          address,
          service: furnitureTypes.find((t) => t.id === cfg.type)?.service ?? "",
          furnitureLabel: furnitureTypes.find((t) => t.id === cfg.type)?.label ?? cfg.type,
          fabricLabel: fabrics.find((f) => f.id === cfg.fabric)?.label ?? cfg.fabric,
          colorLabel:
            cfg.color === "autre"
              ? cfg.otherColor || "Autre couleur"
              : (colors.find((col) => col.id === cfg.color)?.label ?? cfg.color),
          summary: summarize(cfg),
        }),
      );
    } catch {
      /* Le devis reste utilisable si le stockage de session est indisponible. */
    }
  }, [cfg, form.postal_code, form.city, address]);
  useEffect(() => {
    writeDraft({
      cfg,
      step,
      address,
      form: {
        customer_name: form.customer_name,
        phone: form.phone,
        email: form.email,
        postal_code: form.postal_code,
        city: form.city,
        message: form.message,
      },
      slotId,
      payment,
    });
  }, [cfg, step, address, form, slotId, payment]);
  useEffect(() => {
    if (!address.trim() || !/^\d{5}$/.test(form.postal_code)) {
      setDistanceKm(null);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      geocodeAddress(`${address} ${form.postal_code} ${form.city}`.trim())
        .then((point) => {
          if (!cancelled) setDistanceKm(point ? haversineKm(point.lon, point.lat) : null);
        })
        .catch(() => {
          if (!cancelled) setDistanceKm(null);
        });
    }, 600);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [address, form.postal_code, form.city]);
  useEffect(() => {
    if (!restoreDraft || !initialDraft) return;
    if (initialDraft.cfg && types.some((t) => t.id === initialDraft.cfg?.type))
      setCfg({ ...defaultConfiguration, ...initialDraft.cfg });
    if (typeof initialDraft.step === "number") setStep(Math.min(7, Math.max(0, initialDraft.step)));
    if (typeof initialDraft.address === "string") setAddress(initialDraft.address);
    if (initialDraft.form) setForm((f) => ({ ...f, ...initialDraft.form, honeypot: "" }));
    if (typeof initialDraft.slotId === "string") setSlotId(initialDraft.slotId);
    if (initialDraft.payment === "onsite" || initialDraft.payment === "online") setPayment(initialDraft.payment);
  }, []);
  const set = <K extends keyof Configuration>(k: K, v: Configuration[K]) => setCfg((p) => ({ ...p, [k]: v }));
  const info = typeInfo(cfg.type);
  const sofa = info.family === "sofa";
  const price = priceConfiguration(c, cfg, distanceKm);
  const basePercent = totalPercent(signedIn, code?.percent ?? 0, profileDone, isFirstOrder);
  const percent = rouletteState.won
    ? 100
    : rouletteState.played
      ? Math.max(0, basePercent - rouletteState.lostBet)
      : basePercent;
  const finalTotal = applyDiscount(price.total, percent);
  const availablePercent = rouletteState.won
    ? 0
    : rouletteState.played
      ? Math.max(0, basePercent - rouletteState.lostBet)
      : basePercent;
  // Déductions en temps réel après le tour de roulette
  const accountPct = signedIn && isFirstOrder ? ACCOUNT_DISCOUNT : 0;
  const profilePct = profileDone && isFirstOrder ? PROFILE_DISCOUNT : 0;
  const codePct = code?.percent ?? 0;
  const lost = !rouletteState.won && rouletteState.played ? rouletteState.lostBet : 0;
  const effectiveAccountPct = Math.max(0, accountPct - lost);
  const remLost1 = Math.max(0, lost - accountPct);
  const effectiveProfilePct = Math.max(0, profilePct - remLost1);
  const remLost2 = Math.max(0, remLost1 - profilePct);
  const effectiveCodePct = Math.max(0, codePct - remLost2);
  const num = (
    k: "seatCushions" | "backCushions" | "extraArmchairs" | "extraChairs" | "width",
    label: string,
    min: number,
    max: number,
  ) => (
    <div className="field">
      <span id={`cfg-${k}`}>{label}</span>
      <div role="group" aria-labelledby={`cfg-${k}`} className="flex items-center gap-3">
        <button
          type="button"
          aria-label={`Diminuer : ${label}`}
          disabled={cfg[k] <= min}
          onClick={() => set(k, Math.max(min, cfg[k] - (k === "width" ? 10 : 1)))}
          className="h-11 w-11 rounded-full border border-border bg-card text-xl font-semibold disabled:opacity-40"
        >
          −
        </button>
        <span className="min-w-10 text-center text-lg font-semibold" aria-live="polite">
          {cfg[k]}
        </span>
        <button
          type="button"
          aria-label={`Augmenter : ${label}`}
          disabled={cfg[k] >= max}
          onClick={() => set(k, Math.min(max, cfg[k] + (k === "width" ? 10 : 1)))}
          className="h-11 w-11 rounded-full border border-border bg-card text-xl font-semibold disabled:opacity-40"
        >
          +
        </button>
      </div>
    </div>
  );
  const toggle = (k: "decorative" | "pouf" | "stains" | "odors" | "pets" | "removable", label: string) => (
    <label className="choice-label">
      <input
        type="checkbox"
        checked={cfg[k]}
        onChange={(e) => {
          set(k, e.target.checked);
          if (!e.target.checked && k === "odors") set("antiOdorTreatment", false);
          if (!e.target.checked && k === "pets") set("deepPetHairTreatment", false);
        }}
      />
      {label}
    </label>
  );
  const priceText =
    finalTotal === null
      ? "Tarif communiqué par TClean au rendez-vous"
      : `${finalTotal.toLocaleString("fr-FR")} € TTC — Prix final TTC`;
  const applyCode = async () => {
    setCodeMsg("");
    if (!codeInput.trim()) {
      setCode(null);
      return;
    }
    try {
      const r = await check({ data: codeInput });
      if (r.valid) {
        setCode({ code: r.code, percent: r.percent, ends_at: r.ends_at });
        setCodeMsg(`Code ${r.code} appliqué : -${r.percent} %`);
      } else {
        setCode(null);
        setCodeMsg("Ce code n’est pas valide.");
      }
    } catch {
      setCode(null);
      setCodeMsg("Vérification impossible, réessayez.");
    }
  };
  const discountBox = (
    <div className="field">
      <div className="flex items-center justify-between">
        <label htmlFor="cfg-code" className="m-0">
          Code de réduction
        </label>
        {code?.ends_at && promoRemaining && (
          <span className="promo-expiry" role="timer" aria-label={`Expiration du code dans ${promoRemaining}`}>
            Expire dans {promoRemaining}
          </span>
        )}
      </div>
      <div className="inline-actions">
        <input
          id="cfg-code"
          value={codeInput}
          maxLength={40}
          onChange={(e) => setCodeInput(e.target.value.toUpperCase())}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              applyCode();
            }
          }}
          placeholder="Votre code"
        />
        <Button type="button" variant="outline" onClick={applyCode}>
          Appliquer
        </Button>
      </div>
      {codeMsg && <small role="status">{codeMsg}</small>}
      {!signedIn && (
        <small>
          <Link to="/compte" className="underline">
            Créez votre compte client
          </Link>{" "}
          pour bénéficier de {ACCOUNT_DISCOUNT} % de réduction.
        </small>
      )}
    </div>
  );
  const colorLabel =
    cfg.color === "autre" ? cfg.otherColor || "Autre couleur" : colors.find((x) => x.id === cfg.color)?.label;
  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    if (!/^\d{5}$/.test(form.postal_code)) return setError("Le code postal doit contenir 5 chiffres.");
    setFieldError(null);
    if (!/^(?:\+33|0033|0)[1-9]\d{8}$/.test(form.phone.replace(/[\s.\-()]/g, "")))
      return invalidField("phone", "Numéro de téléphone invalide. Exemple : 06 12 34 56 78.");
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(form.email.trim()))
      return invalidField("email", "Adresse e-mail invalide.");
    if (!slotId) return setError("Choisissez une date dans le calendrier.");
    if (!address.trim()) return setError("Indiquez votre adresse.");
    if (!consent) return setError("Votre accord est nécessaire pour traiter cette demande.");
    setBusy(true);
    try {
      const photos = await Promise.all(
        files.map(
          (file) =>
            new Promise<{ name: string; type: "image/jpeg" | "image/png" | "image/webp"; base64: string }>(
              (res, rej) => {
                const r = new FileReader();
                r.onload = () =>
                  res({
                    name: file.name,
                    type: file.type as "image/jpeg",
                    base64: String(r.result).split(",")[1] ?? "",
                  });
                r.onerror = rej;
                r.readAsDataURL(file);
              },
            ),
        ),
      );
      const result = await submit({
        data: {
          kind: "booking",
          customer_name: form.customer_name,
          phone: form.phone,
          email: form.email,
          postal_code: form.postal_code,
          city: form.city,
          address,
          slot_id: slotId,
          photos,
          honeypot: form.honeypot,
          discount_code: code?.code ?? "",
          payment_method: payment,
          details: {
            service: info.service,
            quantity: 1,
            size: cfg.width ? `${cfg.width} cm` : "",
            condition: summarize(cfg),
            date: "",
            message: form.message,
            configurator: cfg,
          },
        },
      });
      setId(result.id);
      window.scrollTo({ top: 0, behavior: "smooth" });
      clearDraft();
      if (payment === "online") setPayId(result.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : "L’envoi a échoué. Réessayez ou appelez TClean.");
      loadSlots()
        .then(setSlots)
        .catch(() => {});
    } finally {
      setBusy(false);
    }
  };
  if (!types.length)
    return (
      <div className="notice">
        Le configurateur sera disponible dès que TClean aura activé ses prestations.{" "}
        <a href={`tel:${telephone(c)}`}>Appelez le {c.phone}</a>.
      </div>
    );
  if (id && payId)
    return (
      <div className="form-panel">
        <h2>Réglez votre réservation</h2>
        <p>
          Votre date est bloquée. Montant : <strong>{priceText}</strong>
        </p>
        <RequestCheckout requestId={payId} />
      </div>
    );
  if (id)
    return (
      <div className="form-panel success-panel">
        <CheckCircle2 size={48} />
        <h2>Votre rendez-vous est confirmé.</h2>
        <p>
          Votre date est bloquée. Retrouvez la confirmation et échangez avec TClean depuis la page Contact (compte
          client requis). Aucun e-mail ni SMS n’est envoyé.
        </p>
        <p>Référence : {id.slice(0, 8).toUpperCase()}</p>
        <Button asChild variant="outline">
          <a href={`tel:${telephone(c)}`}>
            <Phone />
            Appeler {c.name}
          </a>
        </Button>
      </div>
    );
  return (
    <div className="cfg">
      <ol className="cfg-progress" aria-label="Étapes du configurateur">
        {steps.map((s, i) => (
          <li key={s}>
            <Button
              variant="ghost"
              type="button"
              className={i === step ? "current" : i < step ? "done" : ""}
              onClick={() => i <= step && setStep(i)}
              disabled={i > step}
              aria-current={i === step ? "step" : undefined}
            >
              <span>{i + 1}</span>
              {s}
            </Button>
          </li>
        ))}
      </ol>
      <div className="cfg-layout">
        <div className="cfg-preview" aria-live="polite">
          {step === 4 ? <Compare cfg={cfg} /> : <FurniturePhoto cfg={cfg} dirty={step >= 5} className="cfg-svg" />}
          {step >= 5 && (
            <div className="cfg-state-caption">
              <strong>{soilLabels[cfg.soil]}</strong>
              {cfg.stains && <span>Taches visibles</span>}
              {cfg.odors && <span>Odeurs signalées</span>}
              {cfg.pets && <span>Poils d’animaux</span>}
              {(sofa || info.family === "armchair") && cfg.removable && <span>Coussin amovible</span>}
            </div>
          )}
          <p className="cfg-caption">
            {info.label} · {fabrics.find((f) => f.id === cfg.fabric)?.label} · {colorLabel}
          </p>
          <small className="text-muted-foreground">
            Illustration photographique générée, non contractuelle — pas une photo d’intervention TClean. Les odeurs
            sont représentées par un symbole.
          </small>
        </div>
        <form
          className="cfg-panel"
          onSubmit={
            step === 7
              ? onSubmit
              : (e) => {
                  e.preventDefault();
                  setStep(step + 1);
                }
          }
        >
          <h2 ref={stepHeadingRef}>
            {
              [
                "Quel mobilier souhaitez-vous faire nettoyer ?",
                "Sa forme et ses options",
                "Le tissu de votre mobilier",
                "Choisissez la couleur",
                "Visualisez la différence",
                "L’état de votre mobilier",
                "Votre estimation",
                "Choisissez votre date",
              ][step]
            }
          </h2>
          {step === 0 && (
            <div className="cfg-cards" role="radiogroup" aria-label="Type de mobilier">
              {types.map((t) => (
                <Button
                  variant="ghost"
                  type="button"
                  role="radio"
                  aria-checked={cfg.type === t.id}
                  key={t.id}
                  className="cfg-card"
                  onClick={() => setCfg((p) => forType(p, t.id))}
                >
                  <FurniturePhoto
                    compact
                    cfg={forType({ ...cfg, color: cfg.color }, t.id)}
                    className="cfg-thumb"
                    label={t.label}
                  />
                  <span>{t.label}</span>
                </Button>
              ))}
            </div>
          )}
          {step === 1 && (
            <>
              {(sofa || info.family === "armchair") && (
                <div className="field">
                  <label htmlFor="cfg-arms">Accoudoirs</label>
                  <select
                    id="cfg-arms"
                    value={cfg.arms}
                    onChange={(e) => set("arms", e.target.value as Configuration["arms"])}
                  >
                    {Object.entries(armLabels)
                      .filter(([k]) => sofa || k !== "none")
                      .map(([k, v]) => (
                        <option key={k} value={k}>
                          {v}
                        </option>
                      ))}
                  </select>
                </div>
              )}
              {sofa && (
                <div className="field-grid">
                  {num("seatCushions", "Places / coussins d’assise", 1, 8)}
                  {num("backCushions", "Coussins de dossier", 0, 8)}
                </div>
              )}
              {sofa && (
                <div className="choice-grid">
                  {toggle("decorative", "Coussins décoratifs")}
                  {toggle("pouf", "Pouf assorti")}
                </div>
              )}
              {cfg.type === "cushion" && (
                <div className="field-grid">{num("seatCushions", "Nombre de coussins", 1, 8)}</div>
              )}
              {info.family === "mattress" && (
                <div className="field">
                  <label htmlFor="cfg-faces">Faces à nettoyer</label>
                  <select
                    id="cfg-faces"
                    value={cfg.faces}
                    onChange={(e) => set("faces", e.target.value as Configuration["faces"])}
                  >
                    <option value="one">Une face</option>
                    <option value="two">Les deux faces</option>
                  </select>
                </div>
              )}
              <div className="field-grid">
                {c.services.some((s) => s.slug === "fauteuil" && s.enabled) &&
                  num("extraArmchairs", "Fauteuils supplémentaires", 0, 10)}
                {c.services.some((s) => s.slug === "chaises" && s.enabled) &&
                  num("extraChairs", "Chaises supplémentaires", 0, 12)}
              </div>
              {num("width", "Largeur approximative en cm (facultatif, 0 si inconnue)", 0, 600)}
            </>
          )}
          {step === 2 && (
            <>
              <div className="cfg-cards" role="radiogroup" aria-label="Tissu">
                {fabrics.map((f) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cfg.fabric === f.id}
                    key={f.id}
                    className="cfg-card fabric"
                    onClick={() => set("fabric", f.id)}
                  >
                    <span className={`cfg-swatch tex-${f.id}`} />
                    <span>
                      <strong>{f.label}</strong>
                      <small>{f.description}</small>
                    </span>
                  </button>
                ))}
              </div>
              {fabrics.find((f) => f.id === cfg.fabric)?.check && (
                <div className="notice">
                  Ce textile demande une vérification avant intervention : TClean confirmera la méthode adaptée après
                  examen.{cfg.fabric === "inconnu" && " Vous pourrez ajouter une photo à la dernière étape."}
                </div>
              )}
            </>
          )}
          {step === 3 && (
            <>
              <div className="cfg-colors" role="radiogroup" aria-label="Couleur">
                {colors.map((col) => (
                  <button
                    type="button"
                    role="radio"
                    aria-checked={cfg.color === col.id}
                    aria-label={col.label}
                    title={col.label}
                    key={col.id}
                    className="cfg-color"
                    style={{ background: col.hex }}
                    onClick={() => set("color", col.id)}
                    onFocus={() => set("color", col.id)}
                  />
                ))}
              </div>
              <p className="cfg-caption">{colorLabel}</p>
              {cfg.color === "autre" && (
                <div className="field">
                  <label htmlFor="cfg-oc">Précisez la couleur</label>
                  <input
                    id="cfg-oc"
                    value={cfg.otherColor}
                    maxLength={80}
                    onChange={(e) => set("otherColor", e.target.value)}
                  />
                </div>
              )}
            </>
          )}
          {step === 4 && (
            <p>
              Faites glisser le curseur sur l’illustration pour comparer. Le résultat réel dépend du textile, de
              l’ancienneté et de la nature des taches : certaines peuvent ne pas disparaître entièrement.
            </p>
          )}
          {step === 5 && (
            <>
              <div className="field">
                <label htmlFor="cfg-soil">État général</label>
                <select
                  id="cfg-soil"
                  value={cfg.soil}
                  onChange={(e) => set("soil", e.target.value as Configuration["soil"])}
                >
                  {Object.entries(soilLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </div>
              <div className="choice-grid">
                {toggle("stains", "Taches visibles")}
                {toggle("odors", "Odeurs")}
                {toggle("pets", "Poils d’animaux")}
                {toggle("removable", "Coussins amovibles")}
              </div>
            </>
          )}
          {step === 6 && (
            <>
              <div className="field-grid">
                <div className="field">
                  <label htmlFor="cf-postal_code">
                    Code postal *{" "}
                    {cityLoading && <span className="text-xs text-muted-foreground font-normal">(Recherche...)</span>}
                  </label>
                  <input
                    id="cf-postal_code"
                    type="text"
                    required
                    autoComplete="postal-code"
                    inputMode="numeric"
                    maxLength={5}
                    placeholder="Ex : 67000"
                    value={form.postal_code}
                    onChange={(e) => handlePostalCodeChange(e.target.value)}
                  />
                </div>

                <div className="field">
                  <label htmlFor="cf-city">Ville *</label>
                  <input
                    id="cf-city"
                    type="text"
                    required
                    autoComplete="address-level2"
                    maxLength={200}
                    list="cf-cities-list"
                    placeholder="Ex : Strasbourg"
                    value={form.city}
                    onChange={(e) => setForm({ ...form, city: e.target.value })}
                  />
                  {availableCities.length > 1 && (
                    <datalist id="cf-cities-list">
                      {availableCities.map((c) => (
                        <option key={c} value={c} />
                      ))}
                    </datalist>
                  )}
                </div>
              </div>
              <div className="field relative" style={{ position: "relative" }}>
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "4px",
                  }}
                >
                  <label htmlFor="cf-addr" style={{ margin: 0 }}>
                    Adresse (numéro et rue) *{" "}
                    {addressLoading && (
                      <span className="text-xs text-muted-foreground font-normal">(Recherche...)</span>
                    )}
                  </label>
                  <button
                    type="button"
                    onClick={handleLocateMe}
                    disabled={locating}
                    style={{
                      background: "none",
                      border: "1px solid var(--border, #ccc)",
                      borderRadius: "6px",
                      padding: "3px 8px",
                      fontSize: "12px",
                      cursor: locating ? "wait" : "pointer",
                      display: "inline-flex",
                      alignItems: "center",
                      gap: "4px",
                      fontWeight: 500,
                    }}
                  >
                    📍 {locating ? "Localisation en cours..." : "Me localiser"}
                  </button>
                </div>
                {locateError && (
                  <div style={{ fontSize: "11px", color: "var(--destructive, #dc2626)", marginBottom: "4px" }}>
                    {locateError}
                  </div>
                )}
                <input
                  id="cf-addr"
                  required
                  autoComplete="off"
                  maxLength={200}
                  placeholder="Ex : 12 rue du Dôme"
                  value={address}
                  onChange={(e) => {
                    setAddress(e.target.value);
                    setShowAddressDropdown(true);
                  }}
                  onFocus={() => {
                    if (addressSuggestions.length > 0) setShowAddressDropdown(true);
                  }}
                />
                {showAddressDropdown && addressSuggestions.length > 0 && (
                  <ul
                    style={{
                      position: "absolute",
                      top: "100%",
                      left: 0,
                      right: 0,
                      zIndex: 60,
                      maxHeight: "190px",
                      overflowY: "auto",
                      backgroundColor: "var(--popover, #fff)",
                      border: "1px solid var(--border, #ccc)",
                      borderRadius: "6px",
                      marginTop: "4px",
                      padding: "4px 0",
                      listStyle: "none",
                      boxShadow: "0 4px 12px rgba(0,0,0,0.15)",
                    }}
                  >
                    {addressSuggestions.map((s, idx) => (
                      <li
                        key={idx}
                        onMouseDown={(e) => {
                          e.preventDefault();
                          selectAddress(s);
                        }}
                        style={{
                          padding: "8px 12px",
                          cursor: "pointer",
                          textAlign: "left",
                          borderBottom: idx === addressSuggestions.length - 1 ? "none" : "1px solid rgba(0,0,0,0.05)",
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = "rgba(0,0,0,0.06)")}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = "transparent")}
                      >
                        <div style={{ fontWeight: 600, fontSize: "14px" }}>{s.name}</div>
                        <div style={{ fontSize: "12px", opacity: 0.7 }}>
                          {s.postcode} {s.city}
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
              {(cfg.odors || cfg.pets) && (
                <div style={{ marginBottom: "16px" }}>
                  <div style={{ fontSize: "14px", fontWeight: 600, marginBottom: "8px" }}>
                    Options recommandées selon l’état de votre mobilier :
                  </div>
                  <div className="choice-grid">
                    {cfg.odors && (
                      <label className="choice-label">
                        <input
                          type="checkbox"
                          checked={!!cfg.antiOdorTreatment}
                          onChange={(e) => set("antiOdorTreatment", e.target.checked)}
                        />
                        Traitement anti-odeur (+{c.configuratorPrices?.odorTreatment ?? 15} € TTC)
                      </label>
                    )}
                    {cfg.pets && (
                      <label className="choice-label">
                        <input
                          type="checkbox"
                          checked={!!cfg.deepPetHairTreatment}
                          onChange={(e) => set("deepPetHairTreatment", e.target.checked)}
                        />
                        Traitement approfondi anti-poils (+{c.configuratorPrices?.petHairTreatment ?? 35} € TTC)
                      </label>
                    )}
                  </div>
                </div>
              )}
              <dl className="recap">
                {price.lines.map((l) => (
                  <div key={l.label}>
                    <dt>
                      {l.label}
                      {l.label.startsWith("Chaises") ? "" : ` × ${l.quantity}`}
                    </dt>
                    <dd>
                      {l.unit === null
                        ? "Sur devis"
                        : `${l.from ? "À partir de " : ""}${(l.unit * (l.label.startsWith("Chaises") ? 1 : l.quantity)).toLocaleString("fr-FR")} € TTC`}
                    </dd>
                  </div>
                ))}
                {distanceKm !== null && distanceKm <= FREE_RADIUS_KM && price.travelFee === 0 ? (
                  <div>
                    <dt>Déplacement</dt>
                    <dd>Gratuit, dans la zone d’intervention</dd>
                  </div>
                ) : price.travelFee ? (
                  <div>
                    <dt>
                      {distanceKm !== null && distanceKm > FREE_RADIUS_KM ? "Déplacement hors zone" : "Déplacement"}
                    </dt>
                    <dd>{price.travelFee} € TTC</dd>
                  </div>
                ) : null}
                <div>
                  <dt>Temps de séchage</dt>
                  <dd>Entre 12 et 24 h</dd>
                </div>
                {rouletteState.won ? (
                  <div>
                    <dt className="text-emerald-700 font-bold">🎉 Gain Roulette TClean</dt>
                    <dd className="text-emerald-700 font-bold">-100 % (OFFERT)</dd>
                  </div>
                ) : (
                  <>
                    {effectiveAccountPct > 0 && (
                      <div>
                        <dt>Réduction compte client</dt>
                        <dd>-{effectiveAccountPct} %</dd>
                      </div>
                    )}
                    {effectiveProfilePct > 0 && (
                      <div>
                        <dt>Profil complet</dt>
                        <dd>-{effectiveProfilePct} %</dd>
                      </div>
                    )}
                    {code && effectiveCodePct > 0 && (
                      <div>
                        <dt>Code {code.code}</dt>
                        <dd>-{effectiveCodePct} %</dd>
                      </div>
                    )}
                  </>
                )}
                <div>
                  <dt>Prix final TTC</dt>
                  <dd>
                    <strong>
                      {finalTotal === null
                        ? "Tarif communiqué par TClean au rendez-vous"
                        : `${finalTotal.toLocaleString("fr-FR")} € TTC`}
                    </strong>
                  </dd>
                </div>
              </dl>
              {discountBox}
              {c.rouletteEnabled !== false && (
                <RouletteWheel
                  played={rouletteState.played}
                  won={rouletteState.won}
                  onFinish={({ won }) => {
                    setRouletteState({ played: true, won, lostBet: 0 });
                  }}
                />
              )}
              {price.needsCheck && (
                <div className="notice">Montant à confirmer après vérification de l’état réel et du textile.</div>
              )}
            </>
          )}
          {step === 7 && (
            <>
              <div className="cfg-summary">
                <FurniturePhoto cfg={cfg} dirty className="cfg-mini" />
                <p>
                  {summarize(cfg)}
                  {cfg.width ? ` · ${cfg.width} cm` : ""}
                  <br />
                  <strong>{priceText}</strong>
                  {price.travelFee ? (
                    <>
                      <br />
                      Dont déplacement : {price.travelFee} € TTC
                    </>
                  ) : null}
                </p>
              </div>
              <div className="sr-honeypot" aria-hidden="true">
                <label>
                  Site internet
                  <input
                    tabIndex={-1}
                    value={form.honeypot}
                    onChange={(e) => setForm({ ...form, honeypot: e.target.value })}
                    autoComplete="off"
                  />
                </label>
              </div>
              <div className="field">
                <label>Date et heure *</label>
                {slotsLoading ? (
                  <p>Chargement des disponibilités…</p>
                ) : slots.length ? (
                  <BookingCalendar slots={slots} value={slotId} onChange={setSlotId} />
                ) : (
                  <div className="notice">Aucune date disponible pour le moment. Appelez le {c.phone}.</div>
                )}
              </div>
              <div className="field-grid">
                {(
                  [
                    ["customer_name", "Prénom et nom", "name", "text"],
                    ["phone", "Téléphone", "tel", "tel"],
                    ["email", "Adresse e-mail", "email", "email"],
                  ] as const
                ).map(([k, l, ac, ty]) => (
                  <div className="field" key={k}>
                    <label htmlFor={`cf-${k}`}>{l} *</label>
                    <input
                      id={`cf-${k}`}
                      type={ty}
                      required
                      autoComplete={ac}
                      inputMode={k === "phone" ? "tel" : undefined}
                      maxLength={200}
                      value={form[k]}
                      onChange={(e) => {
                        setForm({ ...form, [k]: e.target.value });
                        if (fieldError?.key === k) setFieldError(null);
                      }}
                    />
                    {fieldError?.key === k && (
                      <small role="alert" className="text-destructive">
                        {fieldError.message}
                      </small>
                    )}
                  </div>
                ))}
              </div>
              <div className="field">
                <label htmlFor="cf-msg">Commentaire (facultatif)</label>
                <textarea
                  id="cf-msg"
                  maxLength={3000}
                  value={form.message}
                  onChange={(e) => setForm({ ...form, message: e.target.value })}
                />
              </div>
              <div className="field">
                <label htmlFor="cf-photos">Photos réelles du mobilier (facultatives, 4 max., 5 Mo)</label>
                <input
                  id="cf-photos"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  multiple
                  onChange={(e) => {
                    const s = Array.from(e.target.files ?? []);
                    if (s.length > 4 || s.some((f) => f.size > 5 * 1024 * 1024)) {
                      setError("Ajoutez jusqu’à 4 photos de moins de 5 Mo.");
                      e.target.value = "";
                      return;
                    }
                    setError("");
                    setFiles(s);
                  }}
                />
              </div>
              {discountBox}
              <div className="field">
                <label>Paiement *</label>
                <div className="payment-methods" role="group" aria-label="Choisissez votre mode de paiement">
                  <button
                    type="button"
                    className={`payment-method-option${payment === "onsite" ? " is-selected" : ""}`}
                    aria-pressed={payment === "onsite"}
                    onClick={() => setPayment("onsite")}
                  >
                    <span className="payment-method-indicator" aria-hidden="true" />
                    <span className="payment-method-text">Payer sur place, le jour du rendez-vous</span>
                  </button>
                  {paymentsConfigured && signedIn && finalTotal !== null && (
                    <button
                      type="button"
                      className={`payment-method-option${payment === "online" ? " is-selected" : ""}`}
                      aria-pressed={payment === "online"}
                      onClick={() => setPayment("online")}
                    >
                      <span className="payment-method-indicator" aria-hidden="true" />
                      <span className="payment-method-text">Payer maintenant par carte bancaire</span>
                    </button>
                  )}
                </div>
              </div>
              <div className="configurator-booking-note">
                <span className="configurator-booking-note-icon" aria-hidden="true">
                  <CheckCircle2 size={20} />
                </span>
                <div className="configurator-booking-note-content">
                  <strong>Réservation confirmée automatiquement</strong>
                  <p>
                    Envoyez votre réservation : votre créneau est confirmé automatiquement, sans attente ni démarche
                    supplémentaire.
                  </p>
                </div>
              </div>
              <label className="choice-label">
                <input type="checkbox" checked={consent} onChange={(e) => setConsent(e.target.checked)} />
                <span>
                  J’accepte que mes données soient utilisées pour traiter ma demande.{" "}
                  <Link to="/confidentialite" className="configurator-out-of-zone-link">
                    Politique de confidentialité
                  </Link>
                </span>
              </label>
            </>
          )}
          {error && (
            <p className="text-destructive text-sm" role="alert">
              {error}
            </p>
          )}
          <div className="inline-actions justify-between mt-6">
            {step > 0 ? (
              <Button type="button" variant="outline" onClick={() => setStep(step === 7 ? 0 : step - 1)}>
                <ArrowLeft />
                {step === 7 ? "Modifier ma configuration" : "Retour"}
              </Button>
            ) : (
              <span />
            )}
            {step === 6 ? (
              <Button type="submit">
                <ArrowRight />
                Choisir ma date
              </Button>
            ) : step === 7 ? (
              <Button type="submit" disabled={busy}>
                {busy ? "Confirmation en cours…" : "Réserver cette date"}
              </Button>
            ) : (
              <Button type="submit">
                {step === 5 ? "Voir mon estimation" : "Suivant"}
                <ArrowRight />
              </Button>
            )}
          </div>
        </form>
      </div>
    </div>
  );
}
