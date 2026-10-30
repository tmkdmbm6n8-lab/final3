import { createFileRoute } from "@tanstack/react-router";
import { ZonePage } from "@/components/tclean/public-pages";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/zone-intervention")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Zone d’Intervention Nettoyage Canapé Strasbourg et Environs",
      "Vérifiez votre commune : TClean intervient à Strasbourg, dans l’Eurométropole et les communes voisines du Bas-Rhin pour le nettoyage de vos canapés et textiles.",
      "/zone-intervention",
    ),
  component: ZonePage,
});
