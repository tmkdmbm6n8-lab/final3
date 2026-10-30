import { useEffect, useState, type ReactNode } from "react";
import { SocialBar } from "./social-links";
import { supabase } from "@/integrations/supabase/client";
import { Link, useNavigate, useRouterState } from "@tanstack/react-router";
import { useSuspenseQuery, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Phone,
  Menu,
  X,
  ArrowUpRight,
  CalendarDays,
  FileText,
  LogOut,
  UserRound,
  Shield,
  MessageCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessQuery } from "@/lib/business-query";
import { telephone } from "@/lib/business";
import { siteColorCss, type ElementColors } from "@/lib/site-colors";
import { HIDEABLE, hideKey } from "@/lib/editor-history";
import { useReviewRedirect, useUnread, trackAdminPresence } from "./contact-inbox";
import { SeasonalTheme, SeasonalLogoHat } from "./seasonal-theme";

const baseNav = [
  { to: "/" as const, label: "Accueil" },
  { to: "/contact" as const, label: "Messagerie" },
  { to: "/realisations" as const, label: "Réalisations" },
  { to: "/devis" as const, label: "Prestation sur mesure" },
  { to: "/avis" as const, label: "Avis" },
  { to: "/sav" as const, label: "SAV" },
];

export function SiteShell({ children }: { children: ReactNode }) {
  const { data: config } = useSuspenseQuery(businessQuery);
  const [open, setOpen] = useState(false);
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const navigate = useNavigate();
  const tel = `tel:${telephone(config)}`;
  const disabledPages: string[] = Array.isArray((config as typeof config & { disabledPages?: string[] }).disabledPages)
    ? (config as typeof config & { disabledPages?: string[] }).disabledPages!
    : [];
  const permanentlyDeletedPages: string[] = Array.isArray(
    (config as typeof config & { permanentlyDeletedPages?: string[] }).permanentlyDeletedPages,
  )
    ? (config as typeof config & { permanentlyDeletedPages?: string[] }).permanentlyDeletedPages!
    : [];
  const unavailablePages = [...new Set([...disabledPages, ...permanentlyDeletedPages])];

  useEffect(() => {
    const guardDisabledLinks = (event: MouseEvent) => {
      const target = event.target;
      if (!(target instanceof Element)) return;
      const anchor = target.closest("a[href]");
      if (!(anchor instanceof HTMLAnchorElement)) return;
      let path = "";
      try {
        path = new URL(anchor.href, window.location.origin).pathname;
      } catch {
        return;
      }
      if (!unavailablePages.includes(path)) return;
      event.preventDefault();
      event.stopPropagation();
      navigate({ to: "/", replace: true });
    };
    document.addEventListener("click", guardDisabledLinks, true);
    return () => document.removeEventListener("click", guardDisabledLinks, true);
  }, [unavailablePages.join("|"), navigate]);

  const unread = useUnread(pathname);
  useReviewRedirect(pathname);
  const [userId, setUserId] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setUserId(data.session?.user.id ?? null));
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  const signed = !!userId;

  const adminQuery = useQuery({
    queryKey: ["is-admin-shell", userId],
    enabled: !!userId,
    queryFn: async () => {
      if (!userId) return false;
      const result = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
      return result.data === true;
    },
  });

  const isAdmin = adminQuery.data === true;
  const previewRequested =
    typeof window !== "undefined" && new URLSearchParams(window.location.search).has("tclean-preview");
  useEffect(() => {
    if (!unavailablePages.includes(pathname)) return;
    if (previewRequested && adminQuery.isLoading) return;
    if (previewRequested && isAdmin) return;
    navigate({ to: "/", replace: true });
  }, [unavailablePages.join("|"), pathname, navigate, previewRequested, adminQuery.isLoading, isAdmin]);

  useEffect(() => {
    if (!isAdmin) return;
    return trackAdminPresence();
  }, [isAdmin, userId]);

  // Mise à jour instantanée : dès qu'un réglage du site change en base, tous les visiteurs
  // ouverts rechargent la configuration sans attendre.
  const queryClient = useQueryClient();
  useEffect(() => {
    const channel = supabase
      .channel("public-business-settings")
      .on("postgres_changes", { event: "*", schema: "public", table: "business_settings" }, () => {
        void queryClient.invalidateQueries({ queryKey: ["business"] });
      })
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [queryClient]);

  const logout = async () => {
    setOpen(false);
    await supabase.auth.signOut();
    navigate({ to: "/", replace: true });
  };

  const nav = (isAdmin ? [...baseNav, { to: "/administration" as const, label: "Admin" }] : baseNav).filter(
    (item) => !unavailablePages.includes(item.to),
  );

  const label = (item: { to: string; label: string }) => (
    <>
      {item.to === "/administration" && <Shield size={14} className="inline mr-1 text-primary" />}
      {item.label}

      {item.to === "/contact" && unread > 0 && (
        <span
          className="nav-badge"
          aria-label={`${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`}
        >
          {unread}
        </span>
      )}
    </>
  );
  // Réglages enregistrés depuis le mode édition, appliqués aux visiteurs
  const cfg = config as unknown as Record<string, Record<string, string> | undefined>;
  const siteColorStyle = siteColorCss(
    (config.themeColors ?? {}) as Record<string, string>,
    (config.elementColors ?? {}) as Record<string, ElementColors>,
    pathname,
  );

  useEffect(() => {
    const hiddenMap = cfg["hidden"] ?? {};
    const audienceMap = cfg["audience"] ?? {};
    const linkMap = cfg["links"] ?? {};
    const contentMap = (cfg["content"] ?? {}) as Record<string, string>;
    const editorSelector =
      ".tc-site-editor-phone, .tc-phone-floating-pill, .tc-device-simulator-overlay, .tc-typography-toolbar, .tc-color-editor-modal, .tc-editor-modal";

    const applyHidden = () => {
      document.querySelectorAll<HTMLElement>(HIDEABLE).forEach((el) => {
        if (el.closest(editorSelector)) return;
        const key = hideKey(el);
        let hide = false;
        if (key && hiddenMap[key] !== undefined) {
          const audience = audienceMap[`hide:${key}`] ?? "all";
          hide = audience === "all" || (audience === "client" && !isAdmin) || (audience === "admin" && isAdmin);
        }
        if (hide) {
          el.style.setProperty("display", "none", "important");
          el.dataset["tcHidden"] = "1";
        } else if (el.dataset["tcHidden"]) {
          el.style.removeProperty("display");
          delete el.dataset["tcHidden"];
        }
      });
    };

    const applyContent = () => {
      document.querySelectorAll<HTMLElement>("h1, h2, h3, h4, h5, h6, p, span, a, button, li, dt, dd").forEach((el) => {
        if (el.closest(editorSelector)) return;
        // Mémorise le texte d'origine au premier passage
        if (!el.dataset["tcOriginalText"]) {
          const raw = (el.textContent ?? "").trim().replace(/\s+/g, " ");
          if (raw) el.dataset["tcOriginalText"] = raw;
        }

        const tag = el.tagName.toLowerCase();
        const originalText = el.dataset["tcOriginalText"]?.slice(0, 80);
        if (!originalText) return;

        const textKey = `${tag}:${originalText}`;
        const btn = el.closest("a, button");
        const btnKey = btn ? hideKey(btn) : null;

        const newText = contentMap[textKey] ?? (btnKey ? contentMap[btnKey] : undefined);

        if (newText !== undefined) {
          const audience = audienceMap[`text:${textKey}`] ?? audienceMap[`text:${btnKey}`] ?? "all";
          const visible =
            audience === "all" || (audience === "client" && !isAdmin) || (audience === "admin" && isAdmin);
          if (visible && el.textContent !== newText) {
            el.textContent = newText;
          }
        } else if (el.dataset["tcOriginalText"] && el.textContent !== el.dataset["tcOriginalText"]) {
          el.textContent = el.dataset["tcOriginalText"];
        }
      });
    };

    const applyLinks = () => {
      document.querySelectorAll<HTMLElement>("a, button").forEach((btn) => {
        if (btn.closest(editorSelector)) return;
        const originalHref = btn.tagName === "A" ? (btn.getAttribute("href") ?? "") : "";
        const label = (btn.textContent ?? "").trim().slice(0, 50) || "Bouton sans texte";
        const target = linkMap[`${label}|${originalHref}`];
        if (target) btn.dataset["tcTarget"] = target;
        else delete btn.dataset["tcTarget"];
      });
    };

    const onClick = (event: MouseEvent) => {
      if (document.querySelector(".tc-site-editor-phone")) return;
      const el = event.target instanceof Element ? event.target.closest<HTMLElement>("[data-tc-target]") : null;
      if (!el?.dataset["tcTarget"]) return;
      event.preventDefault();
      event.stopPropagation();
      navigate({ to: el.dataset["tcTarget"] as "/" });
    };

    const applyAll = () => {
      applyHidden();
      applyContent();
      applyLinks();
    };

    applyAll();
    const observer = new MutationObserver(applyAll);
    observer.observe(document.body, { childList: true, subtree: true });
    document.addEventListener("click", onClick, true);
    return () => {
      observer.disconnect();
      document.removeEventListener("click", onClick, true);
    };
  }, [config, isAdmin, pathname, navigate]);

  return (
    <>
      <SeasonalTheme />
      <header className="site-header">
        <div className="container-main header-inner">
          <Link to="/" className="brand" aria-label={`${config.name} — Accueil`}>
            <div className="brand-logo-container">
              <SeasonalLogoHat />
              <img src={config.logo} alt={config.name} width={142} height={33} decoding="async" fetchPriority="high" />
            </div>
            <div className="brand-caption">Le soin de votre intérieur</div>
          </Link>

          <nav className="desktop-nav" aria-label="Navigation principale">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} className={pathname === item.to ? "active" : ""}>
                {label(item)}
              </Link>
            ))}
          </nav>

          <div className="header-actions">
            <Button
              asChild
              variant="outline"
              size="icon"
              className="header-icon-button"
              title={signed ? "Mon compte" : "Connexion"}
              aria-label={signed ? "Mon compte" : "Connexion"}
            >
              <Link to="/compte" aria-label={signed ? "Mon compte" : "Connexion"}>
                <UserRound size={16} />
              </Link>
            </Button>

            {isAdmin ? (
              <>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="header-icon-button"
                  title="Messagerie"
                  aria-label="Messagerie"
                >
                  <Link to="/administration" aria-label="Messagerie">
                    <MessageCircle size={17} />
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="header-icon-button"
                  title={`Appeler ${config.name}`}
                  aria-label={`Appeler ${config.name}`}
                >
                  <a href={tel} aria-label={`Appeler ${config.name}`}>
                    <Phone size={17} />
                  </a>
                </Button>
              </>
            ) : (
              <>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="header-icon-button"
                  title="Messagerie"
                  aria-label="Messagerie"
                >
                  <Link to="/contact" className="relative" aria-label="Messagerie">
                    <MessageCircle size={17} />
                    {unread > 0 && (
                      <span
                        className="nav-badge"
                        aria-label={`${unread} message${unread > 1 ? "s" : ""} non lu${unread > 1 ? "s" : ""}`}
                      >
                        {unread}
                      </span>
                    )}
                  </Link>
                </Button>
                <Button
                  asChild
                  variant="outline"
                  size="icon"
                  className="header-icon-button"
                  title={`Appeler ${config.name}`}
                  aria-label={`Appeler ${config.name}`}
                >
                  <a href={tel} aria-label={`Appeler ${config.name}`}>
                    <Phone size={17} />
                  </a>
                </Button>
                <Button asChild>
                  <Link to="/configurateur">
                    Réserver un nettoyage
                    <ArrowUpRight />
                  </Link>
                </Button>
              </>
            )}

            {signed && (
              <Button
                variant="outline"
                size="icon"
                className="header-icon-button"
                title="Déconnexion"
                aria-label="Déconnexion"
                onClick={logout}
              >
                <LogOut size={16} />
              </Button>
            )}
          </div>

          <div className="mobile-account-actions" aria-label="Compte utilisateur">
            <Button
              asChild
              variant="outline"
              size="icon"
              className="header-icon-button mobile-account-link"
              title={signed ? "Mon compte" : "Connexion"}
              aria-label={signed ? "Mon compte" : "Connexion"}
            >
              <Link to="/compte" aria-label={signed ? "Mon compte" : "Connexion"}>
                <UserRound size={16} />
              </Link>
            </Button>
            {signed && (
              <Button
                variant="outline"
                size="icon"
                className="header-icon-button"
                title="Déconnexion"
                aria-label="Déconnexion"
                onClick={logout}
              >
                <LogOut size={16} />
              </Button>
            )}
          </div>
          <Button
            className="mobile-menu-trigger"
            variant="ghost"
            size="icon"
            aria-label={open ? "Fermer le menu" : "Ouvrir le menu"}
            onClick={() => setOpen(!open)}
          >
            {open ? <X /> : <Menu />}
          </Button>
        </div>

        {open && (
          <nav className="mobile-nav" aria-label="Menu mobile">
            {nav.map((item) => (
              <Link key={item.to} to={item.to} onClick={() => setOpen(false)}>
                {label(item)}
              </Link>
            ))}

            {isAdmin ? (
              <Button asChild variant="default">
                <Link to="/administration" onClick={() => setOpen(false)}>
                  <Shield size={16} />
                  Admin
                </Link>
              </Button>
            ) : (
              <>
                <Button asChild variant="outline">
                  <Link to="/contact" onClick={() => setOpen(false)}>
                    <MessageCircle size={16} />
                    Messagerie
                    {unread > 0 && <span className="nav-badge">{unread}</span>}
                  </Link>
                </Button>
                <Button asChild>
                  <Link to="/configurateur" onClick={() => setOpen(false)}>
                    Réserver un nettoyage
                  </Link>
                </Button>
              </>
            )}

            {signed && (
              <Button variant="outline" onClick={logout}>
                <LogOut />
                Déconnexion
              </Button>
            )}
          </nav>
        )}
      </header>

      {siteColorStyle && <style>{siteColorStyle}</style>}
      <main>{children}</main>

      <section className="cta-band">
        <div className="container-main cta-inner">
          <div>
            <h2>Un intérieur frais. Un esprit serein.</h2>
            <p>Parlons de votre mobilier et trouvons le soin qui lui convient.</p>
          </div>

          <div className="inline-actions">
            <Button asChild size="lg">
              <Link to="/configurateur">
                Tarifs
                <ArrowUpRight />
              </Link>
            </Button>

            <Button asChild variant="outline" size="lg">
              <a href={tel}>
                <Phone />
                Appeler {config.name}
              </a>
            </Button>
          </div>
        </div>
      </section>

      <footer className="site-footer">
        <div className="container-main">
          <div className="footer-grid">
            <div className="footer-intro">
              <img
                className="footer-logo"
                src={config.logo}
                alt={config.name}
                width={135}
                height={31}
                loading="lazy"
                decoding="async"
              />

              <p>
                Nettoyage professionnel de canapés et textiles d’ameublement. Le soin de votre intérieur, directement à
                domicile.
              </p>
            </div>
            <details
              className="footer-prestations group md:open border-b border-white/10 md:border-none pb-2 md:pb-0"
              open={false}
            >
              <summary className="flex items-center justify-between cursor-pointer list-none py-2 md:py-0 md:mb-5 font-bold text-xs uppercase tracking-wider text-white select-none">
                <span>Nos prestations</span>
                <span className="text-sm opacity-60 md:hidden transition-transform duration-200 group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="pt-2 md:pt-0 flex flex-col space-y-2">
                <Link to="/prestations" className="hover:text-emerald-300 transition-colors">
                  Toutes nos prestations
                </Link>
                {config.services
                  .filter((service) => service.enabled)
                  .map((service) => (
                    <Link
                      key={service.slug}
                      to="/prestations/$slug"
                      params={{ slug: service.slug }}
                      className="hover:text-emerald-300 transition-colors"
                    >
                      {service.name}
                    </Link>
                  ))}
              </div>
            </details>

            <details className="group md:open border-b border-white/10 md:border-none pb-2 md:pb-0" open={false}>
              <summary className="flex items-center justify-between cursor-pointer list-none py-2 md:py-0 md:mb-5 font-bold text-xs uppercase tracking-wider text-white select-none">
                <span>À votre service</span>
                <span className="text-sm opacity-60 md:hidden transition-transform duration-200 group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="pt-2 md:pt-0 flex flex-col space-y-2">
                <Link to="/a-propos" className="hover:text-emerald-300 transition-colors">
                  À propos de {config.name}
                </Link>
                <Link to="/tarifs" className="hover:text-emerald-300 transition-colors">
                  Nos tarifs
                </Link>
                <Link to="/devis" className="hover:text-emerald-300 transition-colors">
                  Demander un devis
                </Link>
                <Link to="/configurateur" className="hover:text-emerald-300 transition-colors">
                  Configurateur de canapé
                </Link>
                <Link to="/configurateur" className="hover:text-emerald-300 transition-colors">
                  Réserver un nettoyage
                </Link>
                <Link to="/faq" className="hover:text-emerald-300 transition-colors">
                  Questions fréquentes
                </Link>
                <Link to="/realisations" className="hover:text-emerald-300 transition-colors">
                  Nos réalisations
                </Link>
              </div>
            </details>

            <details className="group md:open border-b border-white/10 md:border-none pb-2 md:pb-0" open={false}>
              <summary className="flex items-center justify-between cursor-pointer list-none py-2 md:py-0 md:mb-5 font-bold text-xs uppercase tracking-wider text-white select-none">
                <span>Rencontrons-nous</span>
                <span className="text-sm opacity-60 md:hidden transition-transform duration-200 group-open:rotate-180">
                  ▾
                </span>
              </summary>
              <div className="pt-2 md:pt-0 flex flex-col space-y-2">
                <a href={tel} className="hover:text-emerald-300 font-semibold transition-colors">
                  {config.phone}
                </a>
                {config.email && (
                  <a href={`mailto:${config.email}`} className="hover:text-emerald-300 transition-colors">
                    {config.email}
                  </a>
                )}
                <Link to="/zone-intervention" className="hover:text-emerald-300 transition-colors">
                  Nettoyage à domicile
                </Link>
                <Link to="/contact" className="hover:text-emerald-300 transition-colors">
                  Nous contacter
                </Link>
                {config.hours && <p className="opacity-70 text-xs">{config.hours}</p>}
                {config.whatsappVerified && (
                  <a
                    href={`https://wa.me/${telephone(config).replace("+", "")}`}
                    target="_blank"
                    rel="noreferrer"
                    className="hover:text-emerald-300 transition-colors"
                  >
                    WhatsApp
                  </a>
                )}
                <SocialBar className="mt-2" />
              </div>
            </details>
          </div>
          <div className="footer-bottom">
            <span>
              © {new Date().getFullYear()} {config.name}. Le soin de votre intérieur.
            </span>

            <div className="inline-actions">
              <Link to="/mentions-legales">Mentions légales</Link>
              <Link to="/confidentialite">Confidentialité</Link>
              <Link to="/cookies">Cookies</Link>
              <Link to="/conditions">Conditions</Link>
              <Link to="/compte">Mon compte</Link>
              <Link to="/administration">Administration</Link>
            </div>
          </div>
        </div>
      </footer>

      <nav className="mobile-actions" aria-label="Actions rapides">
        <a href={tel}>
          <Phone />
          Appeler
        </a>

        <Link to="/devis">
          <FileText />
          Mon devis
        </Link>

        <Link to="/configurateur">
          <CalendarDays />
          Réserver
        </Link>
      </nav>
    </>
  );
}
