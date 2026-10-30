import nettoyage from "@/assets/tclean-nettoyage.jpg";
import logo from "@/assets/tclean-logo.png";
import type { ElementColors } from "./site-colors";
import type { HistoryEntry } from "./editor-history";
import type { Intervention } from "./interventions";
import { defaultSeasonalThemeSettings, type SeasonalThemeSettings } from "./seasonal-theme";

export const defaultConfig = {
  name: "TClean",
  phone: "07 44 88 11 70",
  city: "Strasbourg",
  email: "contact@tclean-nettoyage.fr",
  hours: "",
  travelFee: 9 as number | null,
  travelFreeFrom: 30,
  minimum: null as number | null,
  bookingDuration: 180,
  whatsappVerified: false,
  logo,
  heroPhoto: "https://videos.pexels.com/video-files/4201911/4201911-uhd_3840_2160_25fps.mp4",
  carePhoto: nettoyage,
  heroTitle: "Redonnez une seconde vie à vos canapés.",
  heroSubtitle:
    "Un nettoyage professionnel de vos textiles d’ameublement, directement à domicile. TClean prend soin de votre intérieur à Strasbourg et dans ses alentours.",
  about:
    "TClean est une entreprise de nettoyage de canapés et de textiles d’ameublement à domicile, à Strasbourg. Notre approche : prendre le temps de comprendre votre mobilier pour proposer une intervention adaptée à son tissu et à son état.",
  legalIdentity: "",
  legalAddress: "",
  registration: "",
  cancellation: "",
  paymentMethods: "",
  cardPaymentEnabled: false,
  rouletteEnabled: true,
  searchConsoleVerification: "zR6g4-cC6eInrPST3quvjJAZdgHbr9rg74Dv1w2lj3o",
  socialUrl: "",
  disabledPages: [] as string[],
  permanentlyDeletedPages: [] as string[],
  content: {} as Record<string, string>,
  images: {} as Record<string, string>,
  links: {} as Record<string, string>,
  hidden: {} as Record<string, string>,
  permanentHidden: {} as Record<string, boolean>,
  typography: {} as Record<string, string>,
  editHistory: [] as HistoryEntry[],
  themeColors: {} as Record<string, string>,
  elementColors: {} as Record<string, ElementColors>,
  media: {} as Record<string, import("./site-colors").PlacedMedia>,
  seasonalTheme: { ...defaultSeasonalThemeSettings } as SeasonalThemeSettings,

  configuratorPrices: {
    sofa2: 59,
    sofa3: 69,
    sofa4: 79,
    sofa5: 89,
    angle: 89,
    panoramic: 99,
    armchair: 29,
    pouf: 15,
    decoCushion: 5,
    mattress1one: 29,
    mattress1two: 39,
    mattress2one: 49,
    mattress2two: 69,
    chair1: 8,
    chair4: 29,
    chair6: 39,
    chair8: 49,
    odorTreatment: 15,
    petHairTreatment: 35,
  },

  services: [
    {
      slug: "canape-tissu",
      name: "Canapé en tissu",
      category: "Canapés",
      description: "Un soin en profondeur pour le cœur de votre salon.",
      enabled: true,
      price: 59 as number | null,
    },
    {
      slug: "canape-angle",
      name: "Canapé d’angle",
      category: "Canapés",
      description: "Chaque assise, chaque recoin, avec la même attention.",
      enabled: true,
      price: 89 as number | null,
    },
    {
      slug: "fauteuil",
      name: "Fauteuil",
      category: "Fauteuils",
      description: "Retrouvez le plaisir de votre place préférée.",
      enabled: true,
      price: 29 as number | null,
    },
    {
      slug: "matelas",
      name: "Matelas",
      category: "Matelas",
      description: "Un nettoyage adapté à votre espace de repos.",
      enabled: true,
      price: 29 as number | null,
    },
    {
      slug: "chaises",
      name: "Chaises en tissu",
      category: "Chaises",
      description: "Prenez soin des textiles qui vous accompagnent au quotidien.",
      enabled: true,
      price: 8 as number | null,
    },
    {
      slug: "pouf",
      name: "Pouf",
      category: "Fauteuils",
      description: "Un coup de fraîcheur pour votre pouf ou votre repose-pieds.",
      enabled: true,
      price: 15 as number | null,
    },
    {
      slug: "canape-convertible",
      name: "Canapé convertible",
      category: "Canapés",
      description: "Un soin adapté aux assises et aux parties accessibles.",
      enabled: true,
      price: 69 as number | null,
    },
    {
      slug: "coussins",
      name: "Coussins",
      category: "Accessoires",
      description: "Vos coussins décoratifs nettoyés à l’unité, sans les déplacer.",
      enabled: true,
      price: 5 as number | null,
    },
    {
      slug: "tapis",
      name: "Tapis",
      category: "Tapis",
      description: "Une intervention adaptée aux fibres de votre tapis.",
      enabled: false,
      price: null as number | null,
    },
    {
      slug: "textiles",
      name: "Autres textiles",
      category: "Textiles",
      description: "Une étude personnalisée de votre textile d’ameublement.",
      enabled: false,
      price: null as number | null,
    },
  ],

  areas: [
    { name: "Strasbourg", codes: "67000,67100,67200" },
    { name: "Schiltigheim", codes: "67300" },
    { name: "Illkirch-Graffenstaden", codes: "67400" },
    { name: "Lingolsheim", codes: "67380" },
    { name: "Ostwald", codes: "67540" },
    { name: "Bischheim", codes: "67800" },
    { name: "Hoenheim", codes: "67800" },
    { name: "Eckbolsheim", codes: "67201" },
    { name: "Oberhausbergen", codes: "67205" },
    { name: "Vendenheim", codes: "67550" },
    { name: "Molsheim", codes: "67120" },
    { name: "Obernai", codes: "67210" },
    { name: "Haguenau", codes: "67500" },
  ],

  gallery: [] as Intervention[],

  faqs: [
    {
      q: "Comment fonctionne le nettoyage de canapé par injection-extraction à Strasbourg ?",
      a: "Le nettoyage par injection-extraction consiste à pulvériser au cœur des fibres textiles une solution nettoyante et détachante professionnelle, puis à aspirer instantanément l'eau chargée d'impuretés, de saletés incrustées, d'acariens et d'allergènes. Cette technique préserve les tissus sans les détremper et assure un résultat visible en profondeur.",
    },
    {
      q: "Combien coûte le nettoyage professionnel d'un canapé à domicile ?",
      a: "Le tarif dépend de la taille de votre canapé (2, 3, 4 places, angle réversible, méridienne, canapé panoramique en U ou convertible), de son tissu et de son état d'encrassement. Vous pouvez calculer votre estimation exacte et immédiate en quelques secondes sur notre configurateur en ligne TClean.",
    },
    {
      q: "Quel est le temps de séchage moyen après le nettoyage d’un canapé ?",
      a: "Grâce à la forte puissance d'aspiration de notre matériel professionnel, l'humidité résiduelle est minimale. Le séchage complet s'effectue généralement en 3 à 6 heures en fonction de la fibre (coton, lin, velours, microfibre), de la température ambiante et de l'aération de votre logement à Strasbourg.",
    },
    {
      q: "Pouvez-vous éliminer les odeurs et taches d'urine d'animaux (chat, chien) ?",
      a: "Oui, nous appliquons des traitements spécifiques neutralisants contre les déjections et l'urine de chat ou de chien. Le produit décompose les cristaux d'acide urique responsables des odeurs tenaces et extrait les impuretés en profondeur dans le rembourrage.",
    },
    {
      q: "Quels types de taches pouvez-vous faire disparaître sur les canapés en tissu ?",
      a: "Nous traitons au quotidien les taches du quotidien : café, thé, chocolat, vin rouge, sang, nourriture, sébum, transpiration, traces de feutre, auréoles d'eau et noircissement des accoudoirs. Certaines taches brûlées chimiquement ou très anciennes peuvent laisser une légère ombre, mais la fibre est totalement assainie.",
    },
    {
      q: "Nettoyez-vous aussi les matelas à domicile contre les acariens et les punaises ?",
      a: "Oui, TClean nettoie et désinfecte les matelas (1 place ou 2 places). Notre procédé d'injection-extraction élimine les peaux mortes, la transpiration nocturne, les acariens et leurs déjections, contribuant à réduire significativement les allergies et à assainir votre literie.",
    },
    {
      q: "Prenez-vous en charge les fauteuils, chaises en tissu et poufs ?",
      a: "Absolument. En plus des canapés, nous nettoyons les fauteuils individuels (fauteuils club, crapaud, relax), les chaises de salle à manger capitonnées, les coussins déhoussables ou non, et les poufs assortis.",
    },
    {
      q: "Quels sont les quartiers de Strasbourg et communes d'Alsace desservis ?",
      a: "Nous intervenons dans tous les quartiers de Strasbourg (Centre-ville, Neudorf, Meinau, Robertsau, Cronenbourg, Koenigshoffen, Hautepierre, Neuhof, Port du Rhin, Esplanade) ainsi que dans l'ensemble de l'Eurométropole et du Bas-Rhin : Schiltigheim, Bischheim, Hoenheim, Illkirch-Graffenstaden, Lingolsheim, Ostwald, Eckbolsheim, Vendenheim, Geispolsheim, Molsheim, Obernai, etc.",
    },
    {
      q: "Comment sont calculés les frais de déplacement autour de Strasbourg ?",
      a: "Le déplacement est totalement offert dans un rayon de 20 km autour de notre point de départ. Au-delà de ces 20 km gratuits, un forfait kilométrique transparent de 1 € TTC par kilomètre supplémentaire est automatiquement appliqué lors de votre estimation.",
    },
    {
      q: "Vos produits de nettoyage sont-ils sans danger pour les enfants et les animaux ?",
      a: "Nous sélectionnons rigoureusement des produits nettoyants professionnels écologiques, sans danger toxique pour votre famille ni vos animaux de compagnie après séchage complet. Nous recommandons simplement d'aérer la pièce pendant l'intervention.",
    },
    {
      q: "Faut-il préparer la pièce ou déplacer le canapé avant votre arrivée ?",
      a: "Il vous suffit de retirer les plaids, coussins décoratifs et objets personnels posés sur le canapé, et de libérer un espace d'environ 1 mètre autour du meuble pour faciliter le passage du matériel. Nous nous chargeons du reste.",
    },
    {
      q: "Nettoyez-vous les canapés en velours, microfibre, lin et tissus délicats ?",
      a: "Oui, nous adaptons la pression d'injection, la température et le pH de nos solutions nettoyantes selon la nature du textile (fibres naturelles, laine, coton, lin, synthétiques, alcantara ou microfibres) pour préserver la douceur et l'éclat des couleurs d'origine sans risque d'altération.",
    },
    {
      q: "Quelle est la différence entre un nettoyage vapeur et l'injection-extraction ?",
      a: "La vapeur superficielle ne fait souvent que chauffer et enfoncer la saleté dans le rembourrage. L'injection-extraction professionnelle, au contraire, injecte la solution et aspire simultanément toute la crasse liquide dans un bac de récupération étanche, éliminant physiquement les impuretés.",
    },
    {
      q: "Comment réserver une intervention de nettoyage à domicile à Strasbourg ?",
      a: "La réservation se fait directement sur notre site : vous choisissez votre type de meuble, visualisez le tarif instantanément, et sélectionnez une date et un créneau horaire sur notre calendrier interactif. Vous recevez une confirmation dès validation.",
    },
    {
      q: "Le nettoyage peut-il raviver les couleurs d'un canapé terni par le temps ?",
      a: "Oui, l'accumulation de poussières atmosphériques, de sébum et de frottements voile progressivement la couleur de votre textile. L'extraction élimine ce film grisâtre et redonne à votre mobilier son éclat d'origine.",
    },
    {
      q: "Les auréoles d'eau ou de produits détachants ménagers peuvent-elles partir ?",
      a: "Les auréoles causées par une tentative de nettoyage manuel à l'eau ou au savon ménager sont très fréquentes. Notre matériel professionnel permet d'unifier l'humidité sur toute la surface de l'assise et d'extraire les résidus de savon incrustés, faisant disparaître ces cernes.",
    },
    {
      q: "Quels sont les modes de paiement acceptés pour le règlement ?",
      a: "Vous pouvez régler soit en ligne en toute sécurité par carte bancaire (via Stripe) au moment de votre réservation, soit directement sur place auprès du technicien à l'issue de l'intervention de nettoyage.",
    },
    {
      q: "Proposez-vous un tarif dégressif si j'ai plusieurs meubles à nettoyer ?",
      a: "Oui, le nettoyage groupé de plusieurs meubles (par exemple un canapé + un matelas ou des chaises de salle à manger) vous permet d'optimiser le déplacement et de bénéficier de remises automatiques cumulables sur votre panier global.",
    },
    {
      q: "Traitez-vous les banquettes et sièges de voiture en tissu ?",
      a: "Oui, nous pouvons intervenir sur les textiles d'ameublement ainsi que sur les intérieurs de véhicules (sièges, banquettes arrière, moquettes) sur demande de devis personnalisé.",
    },
    {
      q: "Pourquoi faire appel à un professionnel plutôt que louer une shampouineuse de supermarché ?",
      a: "Les machines grand public en location ont une puissance d'aspiration très faible, ce qui laisse souvent le meuble gorgé d'eau et risque de créer des moisissures internes et de mauvaises odeurs. Notre matériel industriel de grade professionnel garantit une extraction à haute dépression et un résultat hygiénique impeccable.",
    },
    {
      q: "Comment entretenir mon canapé après le passage de TClean ?",
      a: "Après le séchage, nous vous conseillons de passer régulièrement l'aspirateur avec un embout brosse doux. En cas d'accident liquide immédiat, tamponnez avec un chiffon microfibre propre sans frotter et sans appliquer de produits agressifs.",
    },
    {
      q: "Que faire en cas de tache tenace ou de décoloration ancienne ?",
      a: "Si un produit javellisé ou un acide a déjà décoloré la fibre, aucun nettoyage ne peut recréer la teinture manquante. En revanche, nous assurons un diagnostic honnête et transparent dès l'examen visuel de votre meuble.",
    },
    {
      q: "Faut-il quitter son logement pendant le nettoyage du canapé ?",
      a: "Pas du tout. L'intervention est propre, sans projection sur vos murs ou vos sols, et sans émanation de vapeurs toxiques. Vous pouvez vaquer normalement à vos occupations dans votre domicile.",
    },
    {
      q: "Proposez-vous un service de nettoyage pour les professionnels (bureaux, restaurants, hôtels) à Strasbourg ?",
      a: "Oui, nous intervenons également pour les entreprises, salles d'attente, cabinets médicaux, restaurants et espaces de coworking à Strasbourg et dans le Bas-Rhin pour l'entretien régulier de leurs assises et fauteuils en tissu.",
    },
    {
      q: "Combien de temps dure une prestation de nettoyage pour un canapé d'angle ?",
      a: "Pour un canapé d'angle complet avec méridienne, l'intervention dure généralement entre 1h30 et 2h30, selon le degré de salissure et le nombre de coussins à traiter recto-verso.",
    },
    {
      q: "Intervenez-vous les week-ends ou jours fériés ?",
      a: "Nos créneaux disponibles sont consultables en temps réel sur notre calendrier de réservation en ligne, du lundi au samedi, de 8h à 19h. Vous pouvez choisir l'horaire qui correspond le mieux à votre emploi du temps.",
    },
    {
      q: "Puis-je modifier ou annuler mon créneau de réservation ?",
      a: "Oui, vous pouvez contacter directement TClean au 07 44 88 11 70 ou via votre espace client sur le site pour convenir d'un report de rendez-vous en cas d'imprévu.",
    },
    {
      q: "Le nettoyage par injection-extraction risque-t-il d'abîmer le rembourrage ou la mousse ?",
      a: "Non, car notre buse d'extraction n'injecte l'eau savonneuse que dans l'épaisseur du tissu de surface et la réaspire immédiatement, évitant ainsi d'imbiber la mousse profonde de l'assise.",
    },
    {
      q: "Nettoyez-vous les canapés convertibles avec leur matelas d'appoint ?",
      a: "Oui, vous pouvez choisir de nettoyer uniquement la structure et les coussins du canapé convertible, ou d'y ajouter le nettoyage du matelas intérieur pour une remise à neuf intégrale.",
    },
    {
      q: "Délivrez-vous une facture pour chaque prestation ?",
      a: "Oui, une facture détaillée avec TVA et descriptif des prestations réalisées vous est systématiquement transmise après l'intervention.",
    },
    {
      q: "À quelle fréquence est-il recommandé de faire nettoyer son canapé en tissu ?",
      a: "Pour préserver la durée de vie des fibres et maintenir un niveau d'hygiène optimal, nous recommandons un nettoyage professionnel complet une fois par an, ou tous les 6 mois dans les foyers avec jeunes enfants ou animaux domestiques.",
    },
    {
      q: "Comment obtenir un devis personnalisé pour un meuble spécifique ?",
      a: "Rendez-vous sur notre page Devis Gratuit ou contactez-nous directement par téléphone au 07 44 88 11 70 ou via notre messagerie de contact en ligne avec des photos de votre meuble.",
    },
  ],
};

export type BusinessConfig = typeof defaultConfig;

export function telephone(config: BusinessConfig) {
  const digits = config.phone.replace(/\D/g, "");
  return digits.startsWith("0") ? `+33${digits.slice(1)}` : `+${digits}`;
}

export function travelCharge(config: BusinessConfig, subtotal: number | null) {
  return subtotal === null ? null : subtotal < config.travelFreeFrom ? (config.travelFee ?? 0) : 0;
}

export function estimate(config: BusinessConfig, slug: string, quantity: number) {
  const service = config.services.find((item) => item.slug === slug && item.enabled);
  if (service?.price == null) return null;

  const subtotal = service.price * quantity;
  return Math.round(Math.max(subtotal + (travelCharge(config, subtotal) ?? 0), config.minimum ?? 0) * 100) / 100;
}

export function checkArea(config: BusinessConfig, code: string) {
  return config.areas.filter((area) =>
    area.codes
      .split(",")
      .map((item) => item.trim())
      .includes(code),
  );
}
