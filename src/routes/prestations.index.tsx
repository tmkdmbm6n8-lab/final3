import { createFileRoute } from "@tanstack/react-router";
import { PrestationsPage } from "@/components/tclean/public-pages";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/prestations/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Prestations Nettoyage Canapés & Tissus Strasbourg",
      "Nettoyage et détachage professionnel par injection-extraction : canapés en tissu, canapés d’angle, convertibles, fauteuils et matelas à Strasbourg.",
      "/prestations",
    ),
  component: PrestationsPage,
});
