import { createFileRoute } from "@tanstack/react-router";
import { BookingPage } from "@/components/tclean/public-pages";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/reservation")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Réserver Nettoyage Canapé à Domicile Strasbourg",
      "Choisissez votre créneau horaire en ligne pour l’intervention de nettoyage de votre canapé à Strasbourg. Réservation simple et confirmation sous 24h.",
      "/reservation",
    ),
  component: BookingPage,
});
