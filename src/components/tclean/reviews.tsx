import { useState } from "react";
import { useQueryClient, useSuspenseQuery, queryOptions } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { Star, ShieldCheck, PenLine, Sparkles, CheckCircle2, ChevronDown, Image as ImageIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { getReviews, submitReview } from "@/lib/business.functions";
import { PageHeading } from "./shared";

export const reviewsQuery = queryOptions({ queryKey: ["reviews"], queryFn: () => getReviews(), staleTime: 30000 });

const Stars = ({ n, size = 16 }: { n: number; size?: number }) => (
  <div className="flex items-center gap-1 text-amber-400" aria-label={`${n} sur 5`}>
    {[1, 2, 3, 4, 5].map((i) => (
      <Star key={i} size={size} fill={i <= n ? "#f59e0b" : "none"} stroke={i <= n ? "#f59e0b" : "#d1d5db"} />
    ))}
  </div>
);

export function ReviewsPage() {
  const { data: reviews } = useSuspenseQuery(reviewsQuery);
  const qc = useQueryClient();
  const send = useServerFn(submitReview);

  const [rating, setRating] = useState(5);
  const [author, setAuthor] = useState("");
  const [comment, setComment] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [hp, setHp] = useState("");
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const [key, setKey] = useState(0);
  const [showForm, setShowForm] = useState(false);

  // Statistiques calculées en direct
  const averageRating = reviews.length
    ? (reviews.reduce((acc, r) => acc + r.rating, 0) / reviews.length).toFixed(1)
    : "5.0";

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    setBusy(true);
    try {
      const photo = file
        ? await new Promise<{ type: "image/jpeg"; base64: string }>((res, rej) => {
            const r = new FileReader();
            r.onload = () => res({ type: file.type as "image/jpeg", base64: String(r.result).split(",")[1] ?? "" });
            r.onerror = rej;
            r.readAsDataURL(file);
          })
        : null;

      await send({ data: { author, rating, comment, photo, honeypot: hp } });
      setAuthor("");
      setComment("");
      setFile(null);
      setRating(5);
      setKey((k) => k + 1);
      setMsg("Merci ! Votre avis est publié.");
      setShowForm(false);
      await qc.invalidateQueries({ queryKey: ["reviews"] });
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Envoi impossible.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHeading
        title="Avis de nos clients"
        description="La satisfaction de nos clients à Strasbourg et environs après chaque nettoyage à domicile."
      />

      <section className="section container-main max-w-5xl mx-auto px-4 pb-20">
        {/* --- CARTE DE RÉASSURANCE HAUT DE GAMME --- */}
        <div className="bg-gradient-to-br from-emerald-950 via-[#1b4332] to-[#0f281e] text-white rounded-3xl p-6 sm:p-8 shadow-xl mb-8 border border-emerald-800/40">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/10 backdrop-blur-md text-emerald-300 text-xs font-semibold">
                <ShieldCheck size={15} /> Témoignages réels et vérifiés
              </div>
              <div className="flex items-baseline gap-3">
                <span className="text-4xl sm:text-5xl font-extrabold tracking-tight text-white">{averageRating}</span>
                <span className="text-xl sm:text-2xl text-emerald-200 font-semibold">/ 5</span>
                <div className="ml-2">
                  <Stars n={Math.round(Number(averageRating))} size={20} />
                </div>
              </div>
              <p className="text-sm text-white/80">
                Basé sur{" "}
                <strong className="text-white">
                  {reviews.length} intervention{reviews.length > 1 ? "s" : ""}
                </strong>{" "}
                à Strasbourg.
              </p>
            </div>

            <div>
              <Button
                type="button"
                onClick={() => setShowForm((prev) => !prev)}
                className="w-full sm:w-auto bg-amber-400 hover:bg-amber-300 text-neutral-900 font-bold px-6 py-5 rounded-2xl shadow-lg transition-transform active:scale-95"
              >
                <PenLine size={18} className="mr-2" />
                {showForm ? "Fermer le formulaire" : "Donner mon avis"}
              </Button>
            </div>
          </div>
        </div>

        {/* --- FORMULAIRE D'AVIS DÉPLIABLE --- */}
        {showForm && (
          <div className="bg-card border-2 border-emerald-600/30 rounded-3xl p-6 sm:p-8 shadow-xl mb-10 transition-all duration-300">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold flex items-center gap-2">
                <Sparkles className="text-emerald-600" size={20} /> Partager votre expérience
              </h2>
              <button
                type="button"
                onClick={() => setShowForm(false)}
                className="text-xs text-muted-foreground hover:text-foreground underline"
              >
                Annuler
              </button>
            </div>

            <form onSubmit={submit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold mb-2">Votre note sur 5 *</label>
                <div className="flex gap-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <button
                      key={i}
                      type="button"
                      onClick={() => setRating(i)}
                      className="p-2 rounded-xl hover:bg-muted active:scale-90 transition-transform"
                      aria-label={`${i} étoiles`}
                    >
                      <Star
                        size={32}
                        fill={i <= rating ? "#f59e0b" : "none"}
                        stroke={i <= rating ? "#f59e0b" : "#9ca3af"}
                      />
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label htmlFor="rv-name" className="block text-sm font-semibold mb-1">
                  Votre prénom *
                </label>
                <input
                  id="rv-name"
                  required
                  minLength={2}
                  maxLength={80}
                  value={author}
                  onChange={(e) => setAuthor(e.target.value)}
                  placeholder="Ex : Sarah, Thomas..."
                  className="w-full p-3.5 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-emerald-600 outline-none"
                />
              </div>

              <div>
                <label htmlFor="rv-comment" className="block text-sm font-semibold mb-1">
                  Votre commentaire (facultatif)
                </label>
                <textarea
                  id="rv-comment"
                  maxLength={1500}
                  rows={3}
                  value={comment}
                  onChange={(e) => setComment(e.target.value)}
                  placeholder="Canapé taché de café entièrement nettoyé, travail rapide et soigné..."
                  className="w-full p-3.5 rounded-xl border bg-background text-sm focus:ring-2 focus:ring-emerald-600 outline-none resize-none"
                />
              </div>

              <div>
                <label htmlFor="rv-photo" className="block text-sm font-semibold mb-1">
                  Photo après nettoyage (facultative)
                </label>
                <div className="flex items-center gap-3">
                  <input
                    key={key}
                    id="rv-photo"
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={(e) => {
                      const f = e.target.files?.[0] ?? null;
                      if (f && f.size > 5 * 1024 * 1024) {
                        setMsg("La photo doit peser moins de 5 Mo.");
                        e.target.value = "";
                        return;
                      }
                      setFile(f);
                    }}
                    className="text-xs file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:bg-emerald-100 file:text-emerald-800 file:font-semibold hover:file:bg-emerald-200 cursor-pointer"
                  />
                </div>
              </div>

              <div className="sr-honeypot" aria-hidden="true">
                <input tabIndex={-1} value={hp} onChange={(e) => setHp(e.target.value)} autoComplete="off" />
              </div>

              <Button
                type="submit"
                disabled={busy}
                className="w-full sm:w-auto bg-emerald-700 hover:bg-emerald-600 text-white font-bold py-3.5 px-8 rounded-xl shadow-md"
              >
                {busy ? "Publication en cours…" : "Publier mon avis"}
              </Button>

              {msg && (
                <p className="text-sm font-semibold text-emerald-600 mt-2" role="status">
                  {msg}
                </p>
              )}
            </form>
          </div>
        )}

        {/* --- LISTE DES AVIS EN CARTES DE LUXE --- */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          {reviews.length === 0 ? (
            <div className="col-span-full text-center py-12 bg-card rounded-2xl border border-dashed p-8">
              <p className="text-muted-foreground">
                Aucun avis pour le moment. Soyez le premier à partager votre expérience !
              </p>
            </div>
          ) : (
            reviews.map((r) => (
              <article
                key={r.id}
                className="bg-card border border-border/80 hover:border-emerald-700/40 rounded-2xl p-5 sm:p-6 shadow-sm hover:shadow-md transition-all flex flex-col justify-between"
              >
                <div>
                  <div className="flex items-start justify-between gap-3 mb-3">
                    <div className="flex items-center gap-3">
                      {/* Avatar avec initiale */}
                      <div className="w-10 h-10 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 font-bold text-base flex items-center justify-center border border-emerald-300/40">
                        {r.author ? r.author.charAt(0).toUpperCase() : "C"}
                      </div>
                      <div>
                        <strong className="block text-sm font-bold text-foreground">{r.author}</strong>
                        <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-600 dark:text-emerald-400">
                          <CheckCircle2 size={12} /> Nettoyage vérifié
                        </span>
                      </div>
                    </div>
                    <time className="text-[11px] text-muted-foreground whitespace-nowrap">
                      {new Date(r.created_at).toLocaleDateString("fr-FR", {
                        day: "numeric",
                        month: "short",
                        year: "numeric",
                      })}
                    </time>
                  </div>

                  <div className="mb-3">
                    <Stars n={r.rating} size={15} />
                  </div>

                  {r.comment && (
                    <p className="text-sm text-foreground/90 leading-relaxed whitespace-pre-line mb-3">
                      « {r.comment} »
                    </p>
                  )}
                </div>

                {r.photo && (
                  <div className="mt-2 pt-2 border-t border-border/40">
                    <img
                      src={r.photo}
                      alt={`Résultat du nettoyage de ${r.author}`}
                      loading="lazy"
                      className="w-full max-h-56 object-cover rounded-xl border border-border shadow-inner"
                    />
                  </div>
                )}
              </article>
            ))
          )}
        </div>
      </section>
    </>
  );
}
