import { queryOptions } from "@tanstack/react-query";
import { getBusiness } from "./business.functions";
import { defaultConfig, type BusinessConfig } from "./business";
import salon from "@/assets/tclean-salon.jpg";

export const businessQuery = queryOptions({
  queryKey: ["business"],
  queryFn: async () => {
    let config: unknown = null;

    try {
      config = await Promise.race([
        getBusiness(),
        new Promise<null>((_, reject) => setTimeout(() => reject(new Error("Délai dépassé")), 8000)),
      ]);
    } catch (error) {
      console.error(
        "[TClean] Impossible de charger business_settings; utilisation de la configuration par défaut.",
        error,
      );
    }

    const merged = config ? { ...defaultConfig, ...(config as BusinessConfig) } : defaultConfig;
    const legacyLogo = "/src/assets/tclean-logo.png";

    return {
      ...merged,
      searchConsoleVerification: merged.searchConsoleVerification || defaultConfig.searchConsoleVerification,
      heroPhoto: merged.heroPhoto === salon ? defaultConfig.heroPhoto : merged.heroPhoto,

      logo: !merged.logo || merged.logo === legacyLogo ? defaultConfig.logo : merged.logo,
      carePhoto:
        !merged.carePhoto || merged.carePhoto.startsWith("/src/assets/") ? defaultConfig.carePhoto : merged.carePhoto,
      images: {
        ...merged.images,
        ...(merged.images[legacyLogo] ? { [defaultConfig.logo]: merged.images[legacyLogo] } : {}),
      },
    };
  },
  staleTime: 0,
});

const CANONICAL_SITE_ORIGIN = "https://tclean-nettoyage.fr";

export function pageHead(config: BusinessConfig, title: string, description: string, path: string, noindex = false) {
  const personalize = (value: string) =>
    value
      .replaceAll("TClean", config.name)
      .replaceAll("Strasbourg", config.city ?? "Strasbourg")
      .replaceAll("07 44 88 11 70", config.phone ?? "07 44 88 11 70");

  const cleanTitle = personalize(title);
  const cleanDescription = personalize(description);
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  const canonicalUrl = `${CANONICAL_SITE_ORIGIN}${normalizedPath === "/" ? "/" : normalizedPath.replace(/\/$/, "")}`;

  return {
    meta: [
      { title: `${cleanTitle} | ${config.name}` },
      { name: "description", content: cleanDescription },
      { property: "og:title", content: `${cleanTitle} | ${config.name}` },
      { property: "og:description", content: cleanDescription },
      { property: "og:type", content: "website" },
      { property: "og:url", content: canonicalUrl },
      { property: "og:locale", content: "fr_FR" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: `${cleanTitle} | ${config.name}` },
      { name: "twitter:description", content: cleanDescription },
      ...(config.searchConsoleVerification
        ? [{ name: "google-site-verification", content: config.searchConsoleVerification }]
        : []),
      ...(noindex ? [{ name: "robots", content: "noindex,nofollow" }] : [{ name: "robots", content: "index,follow" }]),
    ],
    links: [{ rel: "canonical", href: canonicalUrl }],
  };
}
