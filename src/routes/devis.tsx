import { createFileRoute } from "@tanstack/react-router";
import { QuotePage } from "@/components/tclean/public-pages";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/devis")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Devis Gratuit Nettoyage Canapé Strasbourg",
      "Demandez votre devis gratuit en ligne pour le nettoyage de votre canapé ou textile d’ameublement à Strasbourg et dans l’Eurométropole. Réponse rapide sans engagement.",
      "/devis",
    ),
  component: QuotePage,
});
