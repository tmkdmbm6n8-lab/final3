import { createFileRoute } from "@tanstack/react-router";
import { GalleryPage } from "@/components/tclean/interventions-gallery";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/realisations")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Photos Avant / Après Nettoyage Canapé Strasbourg",
      "Visualisez nos résultats réels en vidéo et photos avant/après : détachage en profondeur de canapés, fauteuils et tissus d’ameublement à Strasbourg.",
      "/realisations",
    ),
  component: GalleryPage,
});
