import { createFileRoute } from "@tanstack/react-router";
import { Configurator } from "@/components/tclean/configurator";
import { businessQuery, pageHead } from "@/lib/business-query";
import { furnitureTypes } from "@/lib/configurator";

export const Route = createFileRoute("/configurateur")({
  validateSearch: (search: Record<string, unknown>): { mobilier?: string | undefined } => ({
    mobilier:
      typeof search["mobilier"] === "string" && furnitureTypes.some((t) => t.id === search["mobilier"])
        ? search["mobilier"]
        : undefined,
  }),
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) =>
    pageHead(
      loaderData ?? ({ name: "TClean" } as import("@/lib/business").BusinessConfig),
      "Configurateur de canapé et estimation de nettoyage",
      "Configurez votre canapé, son tissu et sa couleur, visualisez la différence et demandez votre estimation TClean à Strasbourg.",
      "/configurateur",
    ),
  component: () => (
    <section className="section container-main pt-6">
      <h1 className="sr-only">Configurateur de canapé et estimation TClean</h1>
      <Configurator />
    </section>
  ),
});
