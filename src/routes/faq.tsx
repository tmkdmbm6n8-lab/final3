import { createFileRoute } from "@tanstack/react-router";
import { FaqPage } from "@/components/tclean/public-pages";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/faq")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "FAQ Nettoyage Canapé à Domicile : Séchage, Taches & Tarifs",
      "Toutes les réponses à vos questions sur le nettoyage de canapé à Strasbourg : temps de séchage, efficacité sur les taches tenaces, odeurs, acariens et déroulement.",
      "/faq",
    ),
  component: FaqPage,
});
