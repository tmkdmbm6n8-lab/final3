import { ContactInbox } from "./contact-inbox";
import { SocialBar } from "./social-links";
import { serviceImage } from "@/lib/service-images";
import { useState } from "react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Phone, MapPin, X, ArrowUpRight, CalendarDays, Maximize2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { businessQuery } from "@/lib/business-query";
import { defaultConfig, telephone } from "@/lib/business";
import { PageHeading, ServicesGrid, ContactActions, Process, ZoneChecker, FaqList } from "./shared";
import { RequestForm } from "./request-form";
export function PrestationsPage() {
  return (
    <>
      <PageHeading
        title="Nos prestations"
        description="Des soins adaptés à vos canapés, fauteuils, matelas et textiles d’ameublement. À domicile, à Strasbourg et aux alentours."
      />
      <section className="section">
        <div className="container-main">
          <ServicesGrid />
          <p className="text-xs text-muted-foreground mt-5">
            Photographies d’illustration. La compatibilité du tissu est vérifiée avant toute intervention.
          </p>
        </div>
      </section>
    </>
  );
}
export function ServicePage({ slug }: { slug: string }) {
  const { data: c } = useSuspenseQuery(businessQuery);
  const s = c.services.find((s) => s.slug === slug && s.enabled);
  if (!s)
    return (
      <>
        <PageHeading title="Prestation indisponible" />
        <section className="section container-main">
          <p>Cette prestation n’est actuellement pas proposée.</p>
          <ContactActions service={slug} />
        </section>
      </>
    );
  return (
    <>
      <PageHeading
        title={`Nettoyage de ${s.name.toLocaleLowerCase("fr-FR")} à ${c.city}`}
        description={s.description}
      />
      <section className="section">
        <div className="container-main care-layout">
          <div className="care-image">
            <img
              src={serviceImage(s.slug)}
              alt={`${s.name} — photographie d’illustration`}
              width={1024}
              height={640}
              loading="lazy"
            />
            <small>Photographie d’illustration</small>
          </div>
          <div className="prose-content">
            <span className="eyebrow">Une attention adaptée à vos fibres</span>
            <h2>Le soin de votre {s.name.toLowerCase()}, chez vous.</h2>
            <p>
              Traces du quotidien, taches, odeurs ou poils d’animaux : votre mobilier est examiné pour déterminer les
              possibilités de nettoyage. Certains défauts des fibres peuvent être irréversibles.
            </p>
            <h2>Une méthode choisie pour votre tissu</h2>
            <p>
              Nous examinons la composition, l’étiquette d’entretien et l’état du textile. Lorsque le tissu s’y prête,
              une méthode de nettoyage adaptée est proposée. Les zones sensibles sont évaluées avant le traitement.
            </p>
            <p>
              {s.price === null
                ? "Tarif sur devis personnalisé."
                : `À partir de ${s.price.toLocaleString("fr-FR")} € TTC par meuble. Le montant final est confirmé après étude.`}
            </p>
            <ContactActions service={slug} />
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container-main">
          <h2>Comment se déroule le nettoyage ?</h2>
          <Process />
        </div>
      </section>
      <section className="section container-main">
        <div className="content-narrow prose-content">
          <h2>Séchage et précautions</h2>
          <p>
            Le délai de séchage varie selon la fibre, la méthode employée et les conditions de la pièce. Aérez selon les
            consignes données et attendez le séchage complet avant de réutiliser le mobilier. Aucun retrait total des
            taches ou odeurs n’est garanti.
          </p>
          <FaqList limit={5} />
          <div className="mt-8">
            <ContactActions service={slug} />
          </div>
        </div>
      </section>
      <section className="section section-soft">
        <div className="container-main">
          <h2 className="mb-8">Les autres textiles de votre intérieur</h2>
          <ServicesGrid limit={3} />
        </div>
      </section>
    </>
  );
}
export function PricesPage() {
  const { data: c } = useSuspenseQuery(businessQuery);
  const p = { ...defaultConfig.configuratorPrices, ...(c.configuratorPrices ?? {}) };
  const eur = (n: number) => `${n.toLocaleString("fr-FR")} €`;
  const svc = (slug: string) => c.services.find((s) => s.slug === slug && s.enabled);
  const enabled = (slug: string) => !!svc(slug);
  const svcPrice = (slug: string): string => {
    const s = svc(slug);
    return s && s.price != null ? `À partir de ${eur(s.price)}` : "Sur devis";
  };
  const tables: { title: string; note: string; rows: [string, string][] }[] = [];
  if (enabled("canape-tissu") || enabled("canape-angle"))
    tables.push({
      title: "Prix du nettoyage de canapé en tissu",
      note: "Le prix dépend du nombre de places ou de la forme du canapé.",
      rows: [
        ["Canapé 2 places", eur(p.sofa2)],
        ["Canapé 3 places", eur(p.sofa3)],
        ["Canapé 4 places", eur(p.sofa4)],
        ["Canapé 5 places", eur(p.sofa5)],
        ["Canapé d’angle en L", `À partir de ${eur(p.angle)}`],
        ["Canapé en U", `À partir de ${eur(p.panoramic)}`],
        ["Coussin décoratif supplémentaire", eur(p.decoCushion)],
      ],
    });
  const seats: [string, string][] = [];
  if (enabled("fauteuil")) seats.push(["Fauteuil", eur(p.armchair)]);
  if (enabled("pouf")) seats.push(["Pouf", eur(p.pouf)]);
  if (seats.length)
    tables.push({
      title: "Tarifs de nettoyage de fauteuils et de poufs",
      note: "Nettoyage d’une pièce seule, à domicile.",
      rows: seats,
    });
  if (enabled("matelas"))
    tables.push({
      title: "Prix du nettoyage de matelas",
      note: "Nettoyage à domicile, une face ou deux faces.",
      rows: [
        ["1 personne, une face", eur(p.mattress1one)],
        ["1 personne, deux faces", eur(p.mattress1two)],
        ["2 personnes, une face", eur(p.mattress2one)],
        ["2 personnes, deux faces", eur(p.mattress2two)],
      ],
    });
  if (enabled("chaises"))
    tables.push({
      title: "Tarifs de nettoyage de chaises en tissu",
      note: "Les lots de chaises reviennent moins cher à l’unité.",
      rows: [
        ["1 chaise", eur(p.chair1)],
        ["Lot de 4", eur(p.chair4)],
        ["Lot de 6", eur(p.chair6)],
        ["Lot de 8", eur(p.chair8)],
      ],
    });
  const others: [string, string][] = [];
  if (enabled("canape-convertible")) others.push(["Canapé convertible", svcPrice("canape-convertible")]);
  if (enabled("coussins")) others.push(["Coussins", svcPrice("coussins")]);
  if (enabled("tapis")) others.push(["Tapis", svcPrice("tapis")]);
  if (enabled("textiles")) others.push(["Textiles d’ameublement", svcPrice("textiles")]);
  if (others.length)
    tables.push({
      title: "Autres textiles d’ameublement",
      note: "Tarifs indicatifs, confirmés après étude de votre pièce.",
      rows: others,
    });
  return (
    <>
      <PageHeading
        title="Tarifs de nettoyage de canapé à Strasbourg"
        breadcrumb="Tarifs"
        description="Des prix TTC, calculés selon le type et la taille de votre mobilier. Le montant final est confirmé avant toute intervention."
      />
      <section className="section container-main">
        <div className="price-grid">
          {tables.map((t) => (
            <article key={t.title} className="price-card">
              <h2>{t.title}</h2>
              <p className="text-sm text-muted-foreground mt-2">{t.note}</p>
              <div className="mt-4">
                {t.rows.map(([label, price]) => (
                  <div className="price-row" key={label}>
                    <span>{label}</span>
                    <strong>{price}</strong>
                  </div>
                ))}
              </div>
            </article>
          ))}
        </div>
      </section>
      <section className="section section-soft">
        <div className="container-main care-layout">
          <div className="prose-content">
            <span className="eyebrow">Calcul du tarif</span>
            <h2>Un total clair, avant de réserver</h2>
            <ul>
              <li>Le prix de base dépend du meuble : son type, son nombre de places ou de matelas.</li>
              <li>
                Le configurateur ajoute les options choisies : fauteuils, poufs, coussins et chaises supplémentaires.
              </li>
              <li>Le déplacement s’ajoute à la fin, selon votre adresse exacte.</li>
            </ul>
          </div>
          <div className="prose-content">
            <span className="eyebrow">Déplacement</span>
            <h2>Zone d'intervention et frais de déplacement</h2>
            <p>
              Le déplacement est offert dans un rayon de 20 km autour de Strasbourg. Au-delà, il s'ajoute
              automatiquement au tarif final à raison de 1 € TTC par kilomètre supplémentaire.
            </p>
          </div>
        </div>
      </section>
      <section className="section container-main">
        <div className="text-center mb-8">
          <span className="eyebrow">FAQ</span>
          <h2>Questions fréquentes sur le nettoyage de canapé</h2>
        </div>
        <div className="content-narrow">
          <FaqList limit={4} />
        </div>
      </section>
      <section className="section container-main">
        <div className="notice">
          Très sale, taches incrustées, odeurs ou tissu délicat : nous vérifions votre meuble avant de confirmer le
          prix. Les cuirs, tissus délicats, tapis et traitements spécifiques restent sur devis personnalisé.
        </div>
        <div className="mt-10 text-center">
          <Button asChild size="lg">
            <Link to="/configurateur">
              Calculer mon prix et réserver
              <ArrowUpRight />
            </Link>
          </Button>
        </div>
      </section>
    </>
  );
}
export function QuotePage() {
  return (
    <>
      <PageHeading
        title="Demande de devis gratuit de nettoyage à Strasbourg"
        description="Besoin d'un tarif personnalisé pour votre canapé, fauteuil, matelas ou tissu d'ameublement ? Remplissez ce formulaire sans engagement. Nous étudions votre demande et vous répondons sous 24h avec une estimation transparente et détaillée."
      />
      <section className="section container-main">
        <RequestForm />
      </section>
    </>
  );
}

export function BookingPage() {
  return (
    <>
      <PageHeading
        title="Réserver votre nettoyage à domicile"
        description="Choisissez parmi les disponibilités réellement ouvertes par TClean. Votre rendez-vous reste en attente jusqu’à notre validation."
      />
      <section className="section container-main">
        <RequestForm kind="booking" />
      </section>
    </>
  );
}

export function ContactPage() {
  return (
    <>
      <PageHeading
        title="Contactez TClean ou écrivez-nous"
        description="Une question sur le nettoyage de votre canapé ou de votre mobilier à Strasbourg ? Contactez-nous au 07 44 88 11 70, par e-mail à contact@tclean-nettoyage.fr ou via votre messagerie client sécurisée."
      />
      <ContactInbox />
      <section className="section section-soft">
        <div className="container-main content-narrow prose-content">
          <h2>Comment préparer votre premier échange avec TClean ?</h2>
          <p>
            Pour obtenir une évaluation rapide et adaptée à votre mobilier textile, quelques précisions nous permettent
            de cerner votre besoin : le type de meuble (canapé droit, d’angle, fauteuil, matelas), sa matière (tissu,
            microfibre, velours, cuir) et la nature des traces à traiter (auréoles d’eau, sébum, taches alimentaires,
            odeurs d’animaux).
          </p>
          <p>
            Vous pouvez ajouter une photo de votre meuble directement dans la messagerie ci-dessus. Cela nous permet
            d’examiner l’état du tissu avant d’établir votre devis ou de confirmer un créneau d’intervention.
          </p>
          <h2>Disponibilité et réactivité locale à Strasbourg</h2>
          <p>
            Nous intervenons directement à votre domicile à Strasbourg et dans les communes voisines. Chaque demande est
            traitée avec attention, sans plateforme intermédiaire ni sous-traitance : vous échangez directement avec
            votre artisan intervenant.
          </p>
          <h2>Suivez TClean sur les réseaux sociaux</h2>
          <p>Découvrez nos interventions réelles et nos avant / après en vidéo.</p>
          <SocialBar />
          
        </div>
      </section>
    </>
  );
}

export function ZonePage() {
  const { data: c } = useSuspenseQuery(businessQuery);
  return (
    <>
      <PageHeading
        title={`Nettoyage de canapé à ${c.city} et ses alentours`}
        description="Un service de proximité, directement à votre domicile. Vérifiez votre code postal et échangez avec TClean pour valider votre adresse."
      />
      <section className="section container-main">
        <div className="care-layout items-start">
          <div>
            <span className="eyebrow">Notre zone d’intervention</span>
            <h2>{c.city} et ses alentours.</h2>
            <p className="text-muted-foreground text-sm mt-6">
              La liste ci-dessous est indicative. Votre adresse et les conditions d’accès sont vérifiées avant
              confirmation. Aucun frais de déplacement non défini n’est ajouté automatiquement.
            </p>
            <div className="city-list">
              {c.areas.map((a) => (
                <span key={a.name}>{a.name}</span>
              ))}
            </div>
            <div className="mt-7">
              <ContactActions />
            </div>
          </div>
          <div>
            <ZoneChecker />
            <p className="text-muted-foreground text-xs">
              Un code postal peut couvrir plusieurs communes. Cette vérification n’est pas une confirmation
              d’intervention.
            </p>
          </div>
        </div>
      </section>

      <section className="section section-soft">
        <div className="container-main content-narrow prose-content">
          <h2>Une intervention à domicile organisée pour votre confort</h2>
          <p>
            Nous nous déplaçons directement chez les particuliers et les professionnels avec l'ensemble de notre
            matériel professionnel d'injection-extraction. Vous n’avez aucun meuble à déplacer : nous intervenons sur
            place, dans votre pièce à vivre ou votre chambre.
          </p>
          <p>
            Pour chaque intervention, nous validons avec vous l'adresse exacte, les possibilités de stationnement et
            l'accès à un point d'eau ainsi qu'à une prise électrique standard. Les conditions de déplacement sont
            convenues en amont en toute clarté.
          </p>
          <h2>Communes desservies dans l’Eurométropole et le Bas-Rhin</h2>
          <p>
            Nous couvrons Strasbourg et l’ensemble des communes environnantes (Schiltigheim, Illkirch-Graffenstaden,
            Lingolsheim, Bischheim, Ostwald, Hoenheim, et les localités du secteur). Si votre commune n'apparaît pas
            dans la liste indicative, contactez-nous pour une étude personnalisée.
          </p>
        </div>
      </section>
    </>
  );
}

export function AboutPage() {
  const { data: c } = useSuspenseQuery(businessQuery);
  return (
    <>
      <PageHeading
        title={`${c.name}, le soin de votre intérieur`}
        description="Une entreprise locale de nettoyage de canapés et de textiles, à votre domicile."
      />
      <section className="section container-main">
        <div className="care-layout">
          <div className="care-image">
            <img
              src={c.carePhoto}
              alt="Soin professionnel d’un canapé — illustration"
              width={1200}
              height={912}
              loading="lazy"
            />
            <small>Photographie d’illustration</small>
          </div>
          <div className="prose-content">
            <span className="eyebrow">Une attention sincère à votre mobilier</span>
            <h2>
              Un service de proximité,
              <br />
              une approche soignée.
            </h2>
            <p>{c.about}</p>
            <p>
              Chaque textile a ses particularités. Nous privilégions un échange clair, un examen du mobilier et des
              consignes adaptées, sans promettre de résultats impossibles.
            </p>
            <ContactActions />
          </div>
        </div>
      </section>

      <section className="section section-soft">
        <div className="container-main content-narrow prose-content">
          <h2>La méthode de nettoyage par injection-extraction professionnelle</h2>
          <p>
            Les textiles d’ameublement accumulent au fil des mois poussières fines, acariens, cellules mortes, sébum et
            taches accidentelles. Un dépoussiérage superficiel ne suffit pas à assainir le cœur des fibres.
          </p>
          <p>
            Notre procédé par injection-extraction injecte une solution nettoyante adaptée en profondeur dans les fibres
            avant de l'extraire immédiatement avec les impuretés dissoutes. Cela permet de désincruster les salissures
            en profondeur tout en laissant un temps de séchage maîtrisé.
          </p>
          <h2>Le respect des fibres et la transparence artisanale</h2>
          <p>
            Chaque matière (coton tissé, lin, velours, microfibre, polyester) réagit différemment aux nettoyants et à
            l'humidité. Avant toute action, nous vérifions la réaction du tissu sur une partie discrète et nous vous
            expliquons clairement ce qu’il est possible d'atténuer ou de rattraper.
          </p>
          <p>
            Nous refusons les promesses irréalistes : si une tache est chimiquement fixée ou si une décoloration a
            altéré le pigment d'origine, nous vous en informons avec franchise dès le diagnostic.
          </p>
        </div>
      </section>
    </>
  );
}
export function FaqPage() {
  return (
    <>
      <PageHeading
        title="Vos questions, nos réponses"
        description="Tarifs, textiles, séchage et rendez-vous : les informations pour préparer votre nettoyage à domicile."
      />
      <section className="section container-main">
        <div className="content-narrow">
          <FaqList />
          <div className="mt-8">
            <ContactActions />
          </div>
        </div>
      </section>
    </>
  );
}
export function GalleryPage() {
  const { data: c } = useSuspenseQuery(businessQuery);
  const [filter, setFilter] = useState("Tous");
  const [selected, setSelected] = useState<string | null>(null);
  const [position, setPosition] = useState(50);
  const items = c.gallery.filter((g) => filter === "Tous" || g.category === filter);
  return (
    <>
      <PageHeading
        title="Nos réalisations"
        description="Les interventions TClean, en images. Seules des photographies réelles et autorisées seront présentées comme nos réalisations."
      />
      <section className="section container-main">
        {c.gallery.length === 0 ? (
          <>
            <div className="gallery-grid mb-12">
              {c.services
                .filter((sv) => sv.enabled)
                .map((sv) => (
                  <article key={sv.slug}>
                    <img
                      src={serviceImage(sv.slug)}
                      alt={`${sv.name} — image d’illustration`}
                      loading="lazy"
                      width={1024}
                      height={640}
                    />
                    <div className="inline-actions justify-between mt-4">
                      <h3>{sv.name}</h3>
                      <small className="text-muted-foreground">Illustration</small>
                    </div>
                  </article>
                ))}
            </div>
            <div className="care-layout">
              <div>
                <span className="eyebrow">La transparence avant tout</span>
                <h2>
                  Les vraies réalisations
                  <br />
                  prendront place ici.
                </h2>
                <p className="text-muted-foreground text-sm mt-5 mb-7">
                  Aucune photographie de chantier n’a encore été publiée. Nous ne présentons pas d’images générées comme
                  des résultats avant/après réels.
                </p>
                <ContactActions />
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="inline-actions mb-8">
              {["Tous", ...new Set(c.gallery.map((g) => g.category))].map((cat) => (
                <Button key={cat} variant={filter === cat ? "default" : "outline"} onClick={() => setFilter(cat)}>
                  {cat}
                </Button>
              ))}
            </div>
            <div className="gallery-grid">
              {items.map((g) => (
                <article key={g.url}>
                  {g.beforeUrl ? (
                    <div className="compare">
                      <img src={g.url} alt={`Après — ${g.title}`} loading="lazy" width={600} height={400} />
                      <div
                        className="compare-before"
                        ref={(el) => {
                          if (el) el.style.clipPath = `inset(0 ${100 - position}% 0 0)`;
                        }}
                      >
                        <img src={g.beforeUrl} alt={`Avant — ${g.title}`} loading="lazy" width={600} height={400} />
                      </div>
                      <input
                        aria-label={`Comparer avant et après : ${g.title}`}
                        type="range"
                        min={0}
                        max={100}
                        value={position}
                        onChange={(e) => setPosition(Number(e.target.value))}
                      />
                    </div>
                  ) : (
                    <img src={g.url} alt={g.title} loading="lazy" width={600} height={400} />
                  )}
                  <div className="inline-actions justify-between mt-4">
                    <h3>{g.title}</h3>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label={`Agrandir ${g.title}`}
                      onClick={() => setSelected(g.url)}
                    >
                      <Maximize2 />
                    </Button>
                  </div>
                </article>
              ))}
            </div>
          </>
        )}
      </section>
      {selected && (
        <div
          className="gallery-modal"
          role="dialog"
          aria-modal="true"
          aria-label="Photographie agrandie"
          onClick={() => setSelected(null)}
        >
          <Button
            className="close"
            variant="secondary"
            size="icon"
            aria-label="Fermer la photographie"
            onClick={() => setSelected(null)}
          >
            <X />
          </Button>
          <img src={selected} alt="Réalisation TClean agrandie" />
        </div>
      )}
    </>
  );
}
export function LegalPage({ type }: { type: "legal" | "privacy" | "cookies" | "conditions" }) {
  const { data: c } = useSuspenseQuery(businessQuery);
  const titles = {
    legal: "Mentions légales",
    privacy: "Politique de confidentialité",
    cookies: "Politique relative aux cookies",
    conditions: "Conditions de réservation et de vente",
  };
  return (
    <>
      <PageHeading title={titles[type]} description="Informations relatives au site TClean et à vos demandes." />
      <section className="section container-main">
        <div className="content-narrow prose-content">
          {type === "legal" ? (
            <>
              <div className="notice">Document à compléter et à faire vérifier avant publication.</div>
              <h2>Éditeur</h2>
              <p>
                {c.legalIdentity || "Identité juridique, statut et responsable de publication à renseigner."}
                <br />
                Nom commercial : {c.name}
                <br />
                Téléphone : {c.phone}
                <br />
                {c.legalAddress || "Adresse professionnelle : à renseigner."}
                <br />
                {c.registration || "SIRET et immatriculation : à renseigner."}
              </p>
              <h2>Hébergement</h2>
              <p>
                Site réalisé avec Lovable. Les coordonnées juridiques de l’hébergeur et les informations obligatoires de
                l’éditeur doivent être vérifiées et complétées avant publication.
              </p>
              <h2>Photographies</h2>
              <p>
                Les visuels d’illustration sont signalés. Les réalisations publiées doivent correspondre à des
                photographies réelles utilisées avec autorisation.
              </p>
            </>
          ) : type === "privacy" ? (
            <>
              <div className="notice">
                Modèle à faire vérifier avant mise en ligne. L’identité juridique du responsable et la durée de
                conservation doivent être complétées.
              </div>
              <h2>Données collectées</h2>
              <p>
                Les formulaires recueillent vos coordonnées, les informations sur votre mobilier, votre localisation,
                vos disponibilités et, si vous les joignez, vos photographies.
              </p>
              <h2>Pourquoi ces informations ?</h2>
              <p>
                Elles permettent à TClean d’étudier votre demande de devis, de contact ou de réservation. La demande de
                prestation relève des mesures précontractuelles prises à votre initiative. L’accès aux demandes et aux
                photographies est réservé aux administrateurs autorisés.
              </p>
              <h2>Stockage et destinataires</h2>
              <p>
                Les demandes sont stockées dans Lovable Cloud. Les photographies transmises restent privées. Aucun
                e-mail de notification n’est actuellement configuré. Les modalités de sous-traitance, de conservation et
                de transfert éventuel sont à vérifier avant publication.
              </p>
              <h2>Vos droits</h2>
              <p>
                Pour une demande d’accès, de rectification ou de suppression, contactez TClean au {c.phone}
                {c.email ? ` ou à ${c.email}` : ""}. Vous pouvez aussi adresser une réclamation à la CNIL.
              </p>
            </>
          ) : type === "cookies" ? (
            <>
              <h2>Fonctionnement du site</h2>
              <p>
                Aucun outil publicitaire ni Google Analytics n’est activé. Le stockage nécessaire à la connexion protège
                l’accès à l’administration. Aucun traceur publicitaire optionnel n’est ajouté à cette version.
              </p>
              <h2>Services externes</h2>
              <p>
                Les polices sont chargées depuis Google Fonts. Une connexion Google n’est initiée que lorsque vous
                choisissez ce mode de connexion. Toute future solution de mesure ou de publicité devra être évaluée
                avant activation.
              </p>
            </>
          ) : (
            <>
              <h2>Article 1 — Objet et champ d'application</h2>
              <p>
                Les présentes Conditions Générales de Vente et de Prestation de Services s'appliquent à l'ensemble des
                interventions de nettoyage de mobilier textile, cuir et matelas réalisées à domicile par {c.name} à{" "}
                {c.city}
                et ses environs. Toute réservation ou acceptation de devis implique l'adhésion entière et sans réserve
                du client.
              </p>

              <h2>Article 2 — Devis, réservation et formation du contrat</h2>
              <p>
                Les estimations tarifaires générées sur le site constituent une pré-évaluation. Le contrat n'est
                définitivement formé qu'après validation expresse du créneau et du mobilier par {c.name}. {c.name} se
                réserve le droit de refuser ou de réévaluer une prestation en cas de discordance entre l'état déclaré et
                l'état réel du textile constaté sur place.
              </p>

              <h2>Article 3 — Droit de rétractation et renonciation expresse</h2>
              <p>
                Conformément aux dispositions de l'article L. 221-18 du Code de la consommation, le client consommateur
                dispose en principe d'un délai de rétractation de quatorze (14) jours francs à compter de la conclusion
                du contrat à distance.
              </p>
              <p>
                <strong>Exécution immédiate et renonciation :</strong> Conformément à l'article L. 221-28 1° du Code de
                la consommation, lorsque le client sollicite une intervention fixée avant l'expiration du délai de 14
                jours, il demande expressément le commencement de l'exécution de la prestation avant la fin de ce délai
                et <strong>reconnaît renoncer expressément à son droit de rétractation</strong> une fois la prestation
                pleinement exécutée. Si le client exerce son droit de rétractation alors que l'exécution a débuté mais
                n'est pas achevée, il est redevable d'un montant correspondant aux services d'ores et déjà fournis.
              </p>

              <h2>Article 4 — Tarifs, déplacement et paiement</h2>
              <p>
                Les prix sont indiqués en euros toutes taxes comprises (TTC). Le déplacement est inclus dans le
                périmètre d'intervention prévu ; en dehors de ce périmètre, les frais kilométriques annoncés au devis
                s'appliquent. Le paiement s'effectue intégralement à la fin de l'intervention (carte bancaire ou espèces
                contre facture/reçu), ou en ligne lorsque cette modalité est activée.
              </p>

              <h2>Article 5 — Annulation, report et absence du client</h2>
              <p>
                Toute annulation ou demande de report doit être notifiée au moins <strong>24 heures</strong> avant
                l'heure fixée de l'intervention. En cas d'annulation tardive (moins de 24 heures) ou en cas d'absence du
                client au rendez-vous convenu sans motif légitime, une indemnité forfaitaire de déplacement de{" "}
                <strong>30 € TTC</strong> sera facturée pour compenser le créneau bloqué et les frais engagés.
              </p>

              <h2>Article 6 — Obligations du client et accès</h2>
              <p>
                Le client s'engage à fournir l'accès indispensable à l'eau courante et à une alimentation électrique en
                état de marche. Le mobilier doit être dégagé de tout objet personnel, couverture ou coussin non
                concerné, et les animaux domestiques doivent être tenus à l'écart pendant toute la durée du traitement.
                Si les conditions d'accès rendent la prestation impossible le jour J, le déplacement reste dû.
              </p>

              <h2>Article 7 — Obligation de moyens et limites de responsabilité</h2>
              <p>
                {c.name} est tenu à une <strong>obligation de moyens</strong> selon les règles de l'art du nettoyage par
                injection / extraction.
                {c.name} ne saurait être tenu responsable :
              </p>
              <ul>
                <li>
                  De l'incapacité à éliminer des taches anciennes, brûlures, décolorations solaires, décolorations
                  chimiques (Javel, ammoniaque) ou traces d'usure irréversibles préexistantes ;
                </li>
                <li>
                  Des dommages résultant de tentatives de détachage préalables réalisées par le client lui-même avec des
                  produits inadaptés ;
                </li>
                <li>Des odeurs profondément imprégnées au cœur des mousses denses non déhoussables ;</li>
                <li>
                  Du temps de séchage naturel qui varie selon l'aération, la température ambiante et le type de fibre
                  (habituellement 4 à 8 heures).
                </li>
              </ul>

              <h2>Article 8 — Réception des travaux et réclamations</h2>
              <p>
                La réception des travaux est effectuée contradictoirement par le client à l'issue immédiate de la
                prestation avant règlement. Toute réclamation relative à la prestation doit être notifiée par écrit (via
                la messagerie du site ou par téléphone au {c.phone}) dans un délai maximum de <strong>48 heures</strong>{" "}
                suivant l'intervention, photographies à l'appui, avant toute manipulation ou intervention d'un tiers sur
                le meuble.
              </p>

              <h2>Article 9 — Médiation de la consommation</h2>
              <p>
                Conformément aux articles L. 616-1 et R. 616-1 du Code de la consommation, en cas de litige non résolu à
                l'amiable avec notre service client, le consommateur a le droit de recourir gratuitement à un médiateur
                de la consommation (coordonnées communiquées sur simple demande).
              </p>
            </>
          )}
        </div>
      </section>
    </>
  );
}
