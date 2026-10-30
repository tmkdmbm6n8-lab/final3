import { createFileRoute } from "@tanstack/react-router";
import { ReviewsPage, reviewsQuery } from "@/components/tclean/reviews";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/avis")({
  loader: async ({ context }) => {
    const [c] = await Promise.all([
      context.queryClient.ensureQueryData(businessQuery),
      context.queryClient.ensureQueryData(reviewsQuery),
    ]);
    return c;
  },
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Avis Clients Nettoyage Canapé Strasbourg",
      "Découvrez les avis authentiques de nos clients à Strasbourg et donnez votre retour d’expérience après notre intervention de nettoyage à domicile.",
      "/avis",
    ),
  component: ReviewsPage,
});
