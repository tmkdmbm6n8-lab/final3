import { createFileRoute } from "@tanstack/react-router";
import { AboutPage } from "@/components/tclean/public-pages";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/a-propos")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "À Propos de TClean | Entreprise de Nettoyage Textile à Strasbourg",
      "Découvrez TClean, spécialiste local du nettoyage et de la rénovation de canapés, fauteuils et matelas à domicile à Strasbourg et dans le Bas-Rhin.",
      "/a-propos",
    ),
  component: AboutPage,
});
