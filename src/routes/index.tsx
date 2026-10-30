import { createFileRoute } from "@tanstack/react-router";
import { Home } from "@/components/tclean/home";
import { businessQuery, pageHead } from "@/lib/business-query";

export const Route = createFileRoute("/")({
  loader: ({ context }) => context.queryClient.ensureQueryData(businessQuery),
  head: ({ loaderData }) => {
    if (!loaderData) {
      return { meta: [{ title: "Nettoyage Canapé Strasbourg à Domicile | TClean" }] };
    }

    const baseHead = pageHead(
      loaderData,
      "Nettoyage Canapé Strasbourg à Domicile",
      "TClean nettoie vos canapés et textiles d’ameublement à domicile à Strasbourg et dans les environs. Découvrez nos prestations, nos tarifs et demandez votre devis.",
      "/",
    );

    const structuredData = {
      "@context": "https://schema.org",
      "@type": "HomeAndConstructionBusiness",
      name: loaderData.name,
      legalName: loaderData.name,
      url: "https://tclean-nettoyage.fr/",
      logo: "https://tclean-nettoyage.fr/logo-rond.png",
      telephone: loaderData.phone,
      description:
        "Nettoyage professionnel de canapés, fauteuils, chaises et matelas à domicile à Strasbourg et dans le Bas-Rhin par injection-extraction.",
      priceRange: "€€",
      currenciesAccepted: "EUR",
      paymentAccepted: "Carte bancaire, Espèces",
      areaServed: [
        {
          "@type": "City",
          name: "Strasbourg",
        },
        {
          "@type": "AdministrativeArea",
          name: "Eurométropole de Strasbourg",
        },
        {
          "@type": "AdministrativeArea",
          name: "Bas-Rhin",
        },
      ],
      address: {
        "@type": "PostalAddress",
        addressLocality: "Strasbourg",
        postalCode: "67000",
        addressRegion: "Grand Est",
        addressCountry: "FR",
      },
      geo: {
        "@type": "GeoCoordinates",
        latitude: 48.5734,
        longitude: 7.7521,
      },
      openingHoursSpecification: [
        {
          "@type": "OpeningHoursSpecification",
          dayOfWeek: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"],
          opens: "08:00",
          closes: "19:00",
        },
      ],
      hasOfferCatalog: {
        "@type": "OfferCatalog",
        name: "Prestations de nettoyage textile",
        itemListElement: loaderData.services
          .filter((s) => s.enabled)
          .map((s) => ({
            "@type": "Offer",
            itemOffered: {
              "@type": "Service",
              name: s.name,
              description: s.description,
            },
            price: s.price ?? 59,
            priceCurrency: "EUR",
          })),
      },
    };

    return {
      ...baseHead,
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify(structuredData),
        },
      ],
    };
  },
  component: Home,
});
