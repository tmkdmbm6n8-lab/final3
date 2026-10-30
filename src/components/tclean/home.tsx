import { BotWidget } from "./bot-widget";
import { useEffect, useRef } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowUpRight,
  Phone,
  Check,
  ShieldCheck,
  Leaf,
  House,
  Sparkles,
  HeartHandshake,
  ScanLine,
  Star,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessQuery } from "@/lib/business-query";
import { telephone } from "@/lib/business";
import { ServicesGrid, FaqList, Process } from "./shared";
import { reviewsQuery } from "./reviews";

function ReviewTicker() {
  const { data: reviews } = useSuspenseQuery(reviewsQuery);

  if (reviews.length === 0) return null;

  const entries = [...reviews, ...reviews, ...reviews];

  return (
    <section className="review-ticker" aria-label="Avis clients publiés sur le site TClean">
      <div className="review-ticker-label">
        <Star size={15} fill="currentColor" />
        Avis clients TClean
      </div>

      <div className="review-ticker-window">
        <div className="review-ticker-track">
          {entries.map((review, index) => (
            <article className="review-ticker-card" key={`${review.id}-${index}`} aria-hidden={index >= reviews.length}>
              <span className="review-ticker-stars">
                {"★".repeat(review.rating)}
                {"☆".repeat(5 - review.rating)}
              </span>
              <span className="review-ticker-author">{review.author}</span>
              {review.comment && <span className="review-ticker-comment">« {review.comment} »</span>}
            </article>
          ))}
        </div>
      </div>

      <Link to="/avis" className="review-ticker-link">
        Voir tous les avis
      </Link>
    </section>
  );
}

function HeroVideo() {
  const ref = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const video = ref.current;
    if (!video) return;
    video.muted = true;
    const tryPlay = () => {
      video.play().catch(() => {});
    };
    tryPlay();
    const onTouch = () => {
      tryPlay();
      window.removeEventListener("touchstart", onTouch);
    };
    window.addEventListener("touchstart", onTouch, { passive: true });
    return () => window.removeEventListener("touchstart", onTouch);
  }, []);

  return (
    <video
      ref={ref}
      className="hero-background-video"
      src="https://videos.pexels.com/video-files/4201911/4201911-hd_1920_1080_25fps.mp4"
      autoPlay
      muted
      loop
      playsInline
      preload="auto"
      aria-hidden="true"
    />
  );
}

export function Home() {
  const { data: config } = useSuspenseQuery(businessQuery);
  const title = config.heroTitle;

  return (
    <>
      <section className="hero">
        <HeroVideo />

        <div className="container-main hero-content fade-in">
          <div className="hero-eyebrow">
            <span>
              <Sparkles size={14} />
            </span>
            {config.name} · Nettoyage de canapé à {config.city} et environs
          </div>

          <h1 className="hero-seo-title">
            {title === "Redonnez une seconde vie à vos canapés." ? (
              <>
                Nettoyage professionnel de canapé
                <br />
                <em>à Strasbourg</em>
                <br />
                et alentours
              </>
            ) : (
              title
            )}
          </h1>

          <p className="hero-subtitle">{config.heroSubtitle}</p>

          <div className="hero-ctas">
            <Button asChild variant="hero" size="lg">
              <Link to="/configurateur">
                Tarifs & Estimation
                <ArrowUpRight />
              </Link>
            </Button>

            <Button asChild variant="heroOutline" size="lg">
              <a href={`tel:${telephone(config)}`}>
                <Phone />
                Appeler le {config.phone}
              </a>
            </Button>
          </div>

          <div className="hero-details">
            <span>
              <Check size={13} />
              Devis gratuit & sans engagement
            </span>
            <span>
              <Check size={13} />
              Intervention à domicile (Strasbourg & alentours)
            </span>
            <span>
              <Check size={13} />
              Produits biodégradables & sans odeur
            </span>
          </div>
        </div>
      </section>

      <ReviewTicker />

      <section className="section section-prestations" aria-labelledby="services-title">
        <div className="container-main">
          <div className="section-header">
            <span className="section-eyebrow">Nos spécialités</span>
            <h2 id="services-title">Nos prestations de nettoyage textile</h2>
            <p>Pour chaque tissu, un protocole précis d’injection-extraction adapté à la fibre de vos meubles.</p>
          </div>

          <ServicesGrid />

          <div className="text-center mt-8">
            <Button asChild variant="outline">
              <Link to="/prestations">
                Découvrir toutes nos prestations
                <ArrowUpRight className="ml-1" size={16} />
              </Link>
            </Button>
          </div>
        </div>
      </section>
      <section className="section py-16">
        <div className="container-main">
          <div className="section-header text-center max-w-2xl mx-auto mb-10">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest/10 text-forest text-xs font-bold tracking-wider uppercase mb-3">
              Déroulement
            </span>
            <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight">Comment se déroule votre nettoyage ?</h2>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Un protocole méthodique en 4 étapes simples, directement chez vous.
            </p>
          </div>

          <Process />
        </div>
      </section>

      {/* 1. Nos Engagements / Pourquoi TClean (Cartes Bento raffinées) */}
      <section className="section py-16 bg-muted/30 border-y border-border/50" aria-labelledby="commitments-title">
        <div className="container-main">
          <div className="section-header text-center max-w-2xl mx-auto mb-12">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest/10 text-forest text-xs font-bold tracking-wider uppercase mb-3">
              <Sparkles size={13} /> Pourquoi TClean
            </span>
            <h2 id="commitments-title" className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Notre engagement pour votre intérieur
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Un nettoyage soigné, sans promesses intenables, avec le matériel professionnel d’injection-extraction.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <article className="group bg-card/90 hover:bg-card border border-border/80 hover:border-forest/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center mb-4 group-hover:bg-forest group-hover:text-white transition-colors duration-300">
                <House size={22} />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">À domicile à Strasbourg</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                Nous nous déplaçons directement chez vous avec tout le matériel nécessaire pour un résultat impeccable.
              </p>
            </article>

            <article className="group bg-card/90 hover:bg-card border border-border/80 hover:border-forest/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center mb-4 group-hover:bg-forest group-hover:text-white transition-colors duration-300">
                <ShieldCheck size={22} />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Respect des fibres</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                Chaque tissu est testé avant l’application pour préserver sa texture, ses coutures et ses teintes
                d’origine.
              </p>
            </article>

            <article className="group bg-card/90 hover:bg-card border border-border/80 hover:border-forest/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center mb-4 group-hover:bg-forest group-hover:text-white transition-colors duration-300">
                <Leaf size={22} />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Solutions professionnelles</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                Détachants certifiés, neutralisation des acariens et bactéries sans résidus agressifs pour vos enfants
                et animaux.
              </p>
            </article>

            <article className="group bg-card/90 hover:bg-card border border-border/80 hover:border-forest/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center mb-4 group-hover:bg-forest group-hover:text-white transition-colors duration-300">
                <HeartHandshake size={22} />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Tarification claire</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                Aucune mauvaise surprise : nos tarifs sont annoncés avant intervention et calculés selon le type de
                meuble.
              </p>
            </article>

            <article className="group bg-card/90 hover:bg-card border border-border/80 hover:border-forest/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center mb-4 group-hover:bg-forest group-hover:text-white transition-colors duration-300">
                <ScanLine size={22} />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Diagnostic personnalisé</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                Évaluation de l’état d’usure et des taches pour déterminer la méthode la plus efficace.
              </p>
            </article>

            <article className="group bg-card/90 hover:bg-card border border-border/80 hover:border-forest/40 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300">
              <div className="w-12 h-12 rounded-xl bg-forest/10 text-forest flex items-center justify-center mb-4 group-hover:bg-forest group-hover:text-white transition-colors duration-300">
                <Sparkles size={22} />
              </div>
              <h3 className="text-base font-bold text-foreground mb-2">Séchage rapide</h3>
              <p className="text-xs md:text-sm text-muted-foreground leading-relaxed">
                Aspiration puissante pour extraire jusqu’à 90 % de l’humidité, permettant une réutilisation sous
                quelques heures.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/* 2. Questions fréquentes (Aérées et limitées aux 5 principales sur l'accueil) */}
      <section className="section py-16" aria-labelledby="faq-home-title">
        <div className="container-main max-w-3xl">
          <div className="section-header text-center mb-8">
            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-forest/10 text-forest text-xs font-bold tracking-wider uppercase mb-3">
              Vos questions
            </span>
            <h2 id="faq-home-title" className="text-2xl md:text-3xl font-extrabold tracking-tight">
              Questions fréquentes sur le nettoyage de canapé
            </h2>
            <p className="text-sm md:text-base text-muted-foreground mt-2">
              Tout ce qu’il faut savoir sur le temps de séchage, le détachage et le déroulement de notre visite.
            </p>
          </div>

          <div className="bg-card rounded-2xl border border-border/80 p-6 md:p-8 shadow-sm">
            <FaqList limit={5} />
          </div>

          <div className="mt-8 text-center">
            <Button asChild variant="outline" size="lg" className="rounded-xl hover:bg-forest/5 hover:text-forest">
              <Link to="/faq">
                Consulter toute la FAQ (32 questions)
                <ArrowUpRight className="ml-1.5 h-4 w-4" />
              </Link>
            </Button>
          </div>
        </div>
      </section>

      {/* 3. Bannière d'appel à l'action finale (Design Prestige Vert Forêt & Ambre) */}
      <section className="section py-12 md:py-16">
        <div className="container-main">
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-[#1b4332] via-[#2d6a4f] to-[#0f281e] text-white p-8 md:p-14 shadow-xl border border-emerald-500/20">
            {/* Lueur décorative subtile */}
            <div className="absolute -top-24 -right-24 w-72 h-72 rounded-full bg-emerald-400/15 blur-3xl pointer-events-none" />
            <div className="absolute -bottom-24 -left-24 w-72 h-72 rounded-full bg-amber-400/10 blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col lg:flex-row items-center justify-between gap-8 text-center lg:text-left">
              <div className="max-w-xl">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-white/10 text-emerald-200 text-xs font-semibold backdrop-blur-sm mb-4">
                  <Sparkles size={13} className="text-amber-300" /> Intervention soignée à Strasbourg
                </span>
                <h2 className="text-2xl md:text-3xl font-extrabold tracking-tight text-white mb-3">
                  Prêt à retrouver un canapé propre et frais ?
                </h2>
                <p className="text-sm md:text-base text-emerald-100/90 leading-relaxed">
                  Estimez le prix de votre nettoyage en 2 minutes ou contactez-nous directement pour une date
                  d'intervention.
                </p>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full sm:w-auto [&>a]:w-full [&>a]:sm:w-auto [&>a]:justify-center">
                <Button
                  asChild
                  size="lg"
                  className="bg-amber-400 hover:bg-amber-300 text-stone-950 font-bold shadow-lg transition-transform hover:scale-105"
                >
                  <Link to="/configurateur">
                    Calculer mon tarif
                    <ArrowUpRight className="ml-1.5 h-4 w-4" />
                  </Link>
                </Button>
                <Button
                  asChild
                  size="lg"
                  className="bg-white hover:bg-emerald-50 text-[#1b4332] font-bold shadow-md hover:scale-105 transition-transform"
                >
                  <Link to="/contact">Nous contacter</Link>
                </Button>
              </div>
            </div>
          </div>
        </div>
      </section>
      <BotWidget />
    </>
  );
}
