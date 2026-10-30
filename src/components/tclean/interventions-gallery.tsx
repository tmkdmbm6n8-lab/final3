import { useEffect, useRef, useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { X, Maximize2, Volume2, VolumeX, Sparkles, Image as ImageIcon, Video as VideoIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessQuery } from "@/lib/business-query";
import { interventionPhotos } from "@/lib/interventions";
import { PageHeading, ContactActions } from "./shared";

function useScrollPlayback(count: number) {
  const refs = useRef<(HTMLVideoElement | null)[]>([]);
  useEffect(() => {
    const videos = refs.current.filter((v): v is HTMLVideoElement => Boolean(v));
    if (!videos.length) return;
    const ratios = new Map<HTMLVideoElement, number>();
    const update = () => {
      let best: HTMLVideoElement | null = null;
      let bestRatio = 0.45;
      for (const v of videos) {
        const r = ratios.get(v) ?? 0;
        if (r > bestRatio) {
          best = v;
          bestRatio = r;
        }
      }
      for (const v of videos) {
        if (v === best) {
          if (v.paused)
            v.play().catch(() => {
              v.muted = true;
              v.play().catch(() => {});
            });
        } else if (!v.paused) {
          v.pause();
        }
      }
    };
    const observer = new IntersectionObserver(
      (entries) => {
        for (const e of entries) ratios.set(e.target as HTMLVideoElement, e.intersectionRatio);
        update();
      },
      { threshold: [0, 0.25, 0.5, 0.75, 1] },
    );
    videos.forEach((v) => observer.observe(v));
    return () => observer.disconnect();
  }, [count]);
  return refs;
}

export function GalleryPage() {
  const { data: config } = useSuspenseQuery(businessQuery);
  const [selected, setSelected] = useState<{ url: string; title: string } | null>(null);
  const [muted, setMuted] = useState(true);
  const [activeMediaIndex, setActiveMediaIndex] = useState<Record<number, "video" | "before" | "after">>({});
  const videoRefs = useScrollPlayback(config.gallery.length);

  useEffect(() => {
    if (!selected) return;
    const close = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSelected(null);
    };
    document.addEventListener("keydown", close);
    return () => document.removeEventListener("keydown", close);
  }, [selected]);

  const toggleSound = () => {
    setMuted((prev) => {
      const next = !prev;
      videoRefs.current.forEach((v) => {
        if (v) v.muted = next;
      });
      return next;
    });
  };

  if (!config.gallery.length) {
    return (
      <>
        <PageHeading
          title="Réalisations TClean"
          description="Nos interventions à domicile, en vidéo et en photos avant / après."
        />
        <section className="section container-main">
          <div className="prose-content">
            <h2>Les prochaines interventions arrivent ici.</h2>
            <p>Aucune intervention n’a encore été publiée.</p>
            <ContactActions />
          </div>
        </section>
      </>
    );
  }

  return (
    <>
      <PageHeading
        title="Réalisations TClean"
        description="Nos interventions à domicile, en vidéo et en photos avant / après."
      />

      {/* --- VERSION MOBILE STYLE TIKTOK / REELS --- */}
      <div className="md:hidden px-3 pb-20">
        <div className="h-[80vh] max-h-[720px] w-full overflow-y-scroll snap-y snap-mandatory rounded-2xl bg-black shadow-2xl relative border border-emerald-950/40">
          {config.gallery.map((g, index) => {
            const beforePhotos = interventionPhotos(g, "before");
            const afterPhotos = interventionPhotos(g, "after");
            const currentMode = activeMediaIndex[index] || (g.videoUrl ? "video" : "after");

            return (
              <div
                key={`tiktok-${g.url}-${index}`}
                className="h-full w-full snap-start snap-always relative flex flex-col justify-between overflow-hidden bg-neutral-950 select-none"
              >
                {/* Média plein écran */}
                <div className="absolute inset-0">
                  {currentMode === "video" && g.videoUrl ? (
                    <video
                      ref={(el) => {
                        videoRefs.current[index] = el;
                      }}
                      className="w-full h-full object-cover"
                      src={g.videoUrl}
                      poster={g.url}
                      muted={muted}
                      playsInline
                      loop
                      preload="metadata"
                      aria-label={`Vidéo — ${g.title}`}
                    />
                  ) : currentMode === "before" && beforePhotos[0] ? (
                    <img src={beforePhotos[0]} alt={`Avant — ${g.title}`} className="w-full h-full object-cover" />
                  ) : (
                    <img
                      src={afterPhotos[0] || g.url}
                      alt={`Après — ${g.title}`}
                      className="w-full h-full object-cover"
                    />
                  )}
                  {/* Dégradés sombres en haut et bas pour lisibilité */}
                  <div className="absolute inset-0 bg-gradient-to-b from-black/60 via-transparent to-black/85 pointer-events-none" />
                </div>

                {/* En-tête flottant du Reel */}
                <div className="relative z-10 p-4 flex items-center justify-between text-white">
                  <span className="px-3 py-1 rounded-full bg-black/50 backdrop-blur-md border border-white/20 text-xs font-semibold text-emerald-300">
                    ✨ {g.category || "Intervention Strasbourg"}
                  </span>
                  <div className="flex items-center gap-2">
                    {g.videoUrl && (
                      <button
                        type="button"
                        onClick={toggleSound}
                        className="w-9 h-9 rounded-full bg-black/50 backdrop-blur-md border border-white/20 flex items-center justify-center text-white active:scale-95 transition-transform"
                        aria-label={muted ? "Activer le son" : "Couper le son"}
                      >
                        {muted ? <VolumeX size={16} /> : <Volume2 size={16} />}
                      </button>
                    )}
                    <span className="text-xs text-white/60 bg-black/40 px-2.5 py-1 rounded-full">
                      {index + 1}/{config.gallery.length}
                    </span>
                  </div>
                </div>

                {/* Boutons d'action sur le côté droit (TikTok Style) */}
                <div className="absolute right-3 bottom-24 z-20 flex flex-col items-center gap-3">
                  {g.videoUrl && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaIndex((prev) => ({ ...prev, [index]: "video" }))}
                      className={`w-12 h-12 rounded-full flex flex-col items-center justify-center backdrop-blur-md border transition-all ${
                        currentMode === "video"
                          ? "bg-emerald-600 text-white border-emerald-400 scale-105 shadow-lg"
                          : "bg-black/60 text-white/80 border-white/20"
                      }`}
                    >
                      <VideoIcon size={18} />
                      <span className="text-[9px] font-bold mt-0.5">Vidéo</span>
                    </button>
                  )}

                  {beforePhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaIndex((prev) => ({ ...prev, [index]: "before" }))}
                      className={`w-12 h-12 rounded-full flex flex-col items-center justify-center backdrop-blur-md border transition-all ${
                        currentMode === "before"
                          ? "bg-amber-600 text-white border-amber-400 scale-105 shadow-lg"
                          : "bg-black/60 text-white/80 border-white/20"
                      }`}
                    >
                      <ImageIcon size={18} />
                      <span className="text-[9px] font-bold mt-0.5">Avant</span>
                    </button>
                  )}

                  {afterPhotos.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveMediaIndex((prev) => ({ ...prev, [index]: "after" }))}
                      className={`w-12 h-12 rounded-full flex flex-col items-center justify-center backdrop-blur-md border transition-all ${
                        currentMode === "after"
                          ? "bg-emerald-600 text-white border-emerald-400 scale-105 shadow-lg"
                          : "bg-black/60 text-white/80 border-white/20"
                      }`}
                    >
                      <Sparkles size={18} />
                      <span className="text-[9px] font-bold mt-0.5">Après</span>
                    </button>
                  )}
                </div>

                {/* Bas du Reel : Description & CTA */}
                <div className="relative z-10 p-4 pr-16 text-white space-y-2">
                  <h3 className="font-bold text-base leading-tight text-white drop-shadow-md">{g.title}</h3>
                  {g.description && <p className="text-xs text-white/80 line-clamp-2 drop-shadow">{g.description}</p>}
                  <div className="pt-1">
                    <Button
                      asChild
                      size="sm"
                      className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl shadow-lg"
                    >
                      <Link to="/configurateur">
                        <Sparkles size={14} className="mr-1.5" /> Réserver mon nettoyage
                      </Link>
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* --- VERSION ORDINATEUR / TABLETTE (Grille soignée) --- */}
      <section className="hidden md:block section container-main">
        <div className="space-y-16">
          {config.gallery.map((g, index) => {
            const photos = [
              ...interventionPhotos(g, "before").map((url, i) => ({ url, label: `Avant ${i + 1}` })),
              ...interventionPhotos(g, "after").map((url, i) => ({ url, label: `Après ${i + 1}` })),
            ];
            return (
              <article key={`${g.url}:${index}`} className="border-b border-border pb-12">
                <div className="mb-6 text-center max-w-3xl mx-auto">
                  <span className="eyebrow">{g.category || "Intervention"}</span>
                  <h2 className="break-words">{g.title}</h2>
                  {g.date && (
                    <time className="block mt-2 text-sm text-muted-foreground" dateTime={g.date}>
                      {new Intl.DateTimeFormat("fr-FR", { dateStyle: "long", timeZone: "Europe/Paris" }).format(
                        new Date(`${g.date}T12:00:00Z`),
                      )}
                    </time>
                  )}
                  {g.description && (
                    <p className="mt-4 text-muted-foreground whitespace-pre-line break-words">{g.description}</p>
                  )}
                </div>
                {g.videoUrl && (
                  <div className="flex justify-center mb-8">
                    <video
                      ref={(el) => {
                        videoRefs.current[index] = el;
                      }}
                      className="w-full max-w-4xl max-h-[560px] aspect-video object-contain bg-muted rounded-xl shadow-md"
                      src={g.videoUrl}
                      poster={g.url}
                      controls
                      muted
                      playsInline
                      preload="metadata"
                      aria-label={`Vidéo — ${g.title}`}
                    />
                  </div>
                )}
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 max-w-6xl mx-auto">
                  {photos.map((p, i) => (
                    <Button
                      key={`${p.url}:${i}`}
                      variant="ghost"
                      className="group relative block h-auto w-full p-0 overflow-visible rounded aspect-[4/3] hover:z-10"
                      aria-label={`Agrandir ${p.label} — ${g.title}`}
                      onClick={() => setSelected({ url: p.url, title: `${p.label} — ${g.title}` })}
                    >
                      <img
                        src={p.url}
                        alt={`${p.label} — ${g.title}`}
                        loading="lazy"
                        className="w-full h-full object-cover rounded transition-transform duration-300 group-hover:scale-125 group-hover:shadow-xl"
                      />
                      <span className="absolute top-2 left-2 bg-background text-foreground text-xs font-semibold rounded px-2 py-0.5">
                        {p.label}
                      </span>
                      <Maximize2 className="absolute bottom-2 right-2 bg-background text-foreground rounded p-1" />
                    </Button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      </section>

      {selected && (
        <div
          className="gallery-modal"
          role="dialog"
          aria-modal="true"
          aria-label={selected.title}
          onClick={() => setSelected(null)}
        >
          <Button
            autoFocus
            className="close"
            variant="secondary"
            size="icon"
            aria-label="Fermer la photographie"
            onClick={() => setSelected(null)}
          >
            <X />
          </Button>
          <img src={selected.url} alt={selected.title} />
        </div>
      )}
    </>
  );
}
