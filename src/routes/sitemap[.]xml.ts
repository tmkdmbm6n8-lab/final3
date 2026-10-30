import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: () => {
        const origin = "https://tclean-nettoyage.fr";
        const now = new Date().toISOString().split("T")[0];

        const pages: Array<{ path: string; priority: string; changefreq: string }> = [
          { path: "/", priority: "1.0", changefreq: "weekly" },
          { path: "/prestations", priority: "0.9", changefreq: "monthly" },
          { path: "/prestations/canape-tissu", priority: "0.8", changefreq: "monthly" },
          { path: "/prestations/canape-angle", priority: "0.8", changefreq: "monthly" },
          { path: "/prestations/canape-convertible", priority: "0.8", changefreq: "monthly" },
          { path: "/prestations/fauteuil", priority: "0.8", changefreq: "monthly" },
          { path: "/prestations/chaises", priority: "0.8", changefreq: "monthly" },
          { path: "/prestations/matelas", priority: "0.8", changefreq: "monthly" },
          { path: "/prestations/pouf", priority: "0.7", changefreq: "monthly" },
          { path: "/prestations/coussins", priority: "0.7", changefreq: "monthly" },
          { path: "/tarifs", priority: "0.9", changefreq: "monthly" },
          { path: "/reservation", priority: "0.9", changefreq: "weekly" },
          { path: "/devis", priority: "0.8", changefreq: "monthly" },
          { path: "/realisations", priority: "0.8", changefreq: "weekly" },
          { path: "/avis", priority: "0.8", changefreq: "daily" },
          { path: "/zone-intervention", priority: "0.8", changefreq: "monthly" },
          { path: "/contact", priority: "0.7", changefreq: "monthly" },
          { path: "/faq", priority: "0.7", changefreq: "monthly" },
          { path: "/a-propos", priority: "0.6", changefreq: "monthly" },
          { path: "/conditions", priority: "0.4", changefreq: "yearly" },
        ];

        const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${pages
  .map(
    (p) => `  <url>
    <loc>${origin}${p.path}</loc>
    <lastmod>${now}</lastmod>
    <changefreq>${p.changefreq}</changefreq>
    <priority>${p.priority}</priority>
  </url>`,
  )
  .join("\n")}
</urlset>`;

        return new Response(xml, {
          headers: {
            "Content-Type": "application/xml; charset=utf-8",
            "Cache-Control": "public, max-age=3600, s-maxage=86400",
          },
        });
      },
    },
  },
});
