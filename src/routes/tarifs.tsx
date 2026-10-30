import { createFileRoute } from "@tanstack/react-router";
import { PricesPage } from "@/components/tclean/public-pages";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/tarifs")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Tarifs Nettoyage Canapé Strasbourg | Prix dès 59€",
      "Consultez nos tarifs transparents de nettoyage de canapés, fauteuils, matelas et chaises à domicile à Strasbourg. Devis gratuit et sans mauvaise surprise.",
      "/tarifs",
    ),
  component: PricesPage,
});
