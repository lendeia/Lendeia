// ==================================================================
// FILE TYPE : SUPABASE EDGE FUNCTION
// PURPOSE   :
//   Real server-rendered link previews — for a shared ITEM (?id=) or a
//   shared STORE/profile (?store=). This app is a client-rendered SPA:
//   the real pages only get their name/photos AFTER JavaScript runs and
//   fetches from Supabase. Facebook's (and most platforms') link-
//   preview crawler does NOT execute JavaScript — it only reads
//   whatever plain HTML/meta tags are already in the response. So
//   sharing the raw app URL directly was never going to show a rich
//   preview; there was nothing crawlable there at all. This function
//   returns real Open Graph meta tags fetched fresh from the database,
//   with NO JavaScript required to see them.
//   A real human clicking the resulting Facebook card lands here too,
//   for a split second, then gets redirected on to the actual
//   interactive page - a real HTTP redirect for people (not for crawlers). Crawlers
//   don't run either of those, so they only ever see the static
//   preview markup.
// CONNECTS TO :
//   frontend/pages/Details/Details.jsx's ShareButton uses ?id=<listingId>.
//   frontend/pages/Store/OwnerStore.jsx's and Profile.jsx's ShareButton
//   (sharing your OWN store) both use ?store=<userId>.
// ==================================================================
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

function escapeHtml(s: string): string {
  return (s || "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c] || c));
}

const SITE_NAME = "Lendeia";

// Facebook (and most platforms) decide the card layout from the real
// shape of the og:image: a square image gets the compact square-thumbnail
// card, a wide one gets the big banner card. Owners upload photos in
// whatever shape they like, so every image is run through wsrv.nl (a
// free, open-source image resizing proxy) which center-crops it to a
// true 600x600 square. If that service is ever unavailable the card
// just falls back to Facebook's own handling of the original photo.
function squareImage(url: string): string {
  // fit=contain (not cover) shows the WHOLE photo, adding white
  // padding on the shorter side instead of cropping/zooming into it -
  // cover was filling the square by cutting off the edges of whatever
  // wasn't already square, which is what looked "too zoomed in".
  return `https://wsrv.nl/?url=${encodeURIComponent(url)}&w=600&h=600&fit=contain&cbg=white&output=jpg&q=85`;
}

function renderHtml(
  title: string,
  description: string,
  images: string[],
  appUrl: string,
  opts: { ogType?: string } = {}
): string {
  const squares = images.map(squareImage);
  const imageTags = squares
    .map(
      (img) =>
        `<meta property="og:image" content="${escapeHtml(img)}" />
    <meta property="og:image:width" content="600" />
    <meta property="og:image:height" content="600" />`
    )
    .join("\n    ");
  return `<!DOCTYPE html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${title} | ${SITE_NAME}</title>
    <meta property="og:site_name" content="${SITE_NAME}" />
    <meta property="og:title" content="${title}" />
    <meta property="og:description" content="${description}" />
    ${imageTags}
    ${squares[0] ? `<meta property="og:image:alt" content="${title}" />` : ""}
    <meta property="og:url" content="${escapeHtml(appUrl)}" />
    <meta property="og:type" content="${opts.ogType || "product"}" />
    <meta name="twitter:card" content="summary" />
    <meta name="twitter:title" content="${title}" />
    <meta name="twitter:description" content="${description}" />
    ${squares[0] ? `<meta name="twitter:image" content="${escapeHtml(squares[0])}" />` : ""}
  </head>
  <body>
    <p>Redirecting to <a href="${escapeHtml(appUrl)}">${title}</a> on ${SITE_NAME}...</p>
  </body>
</html>`;
}

// Link-preview crawlers (Facebook, Messenger, WhatsApp, X, LinkedIn,
// Slack, Telegram, Discord...) get the tag page; everyone else gets an
// instant real redirect into the app. Facebook re-scrapes whatever URL
// the page names as og:url ("canonical"), so the tags must be served
// to crawlers at that address too - vercel.json does that by handing
// crawler requests for lendeia.com/?item=... and /?store=... to this
// function. ?debug=1 forces the tag page for any browser, for testing.
const CRAWLER_UA =
  /facebookexternalhit|facebot|twitterbot|linkedinbot|slackbot|whatsapp|telegrambot|discordbot|pinterest|skypeuripreview|redditbot|embedly|vkshare|applebot|googlebot|bingbot/i;

function htmlResponse(html: string): Response {
  return new Response(html, { headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function goHome(appOrigin: string): Response {
  if (!appOrigin) return new Response("Not found", { status: 404 });
  return Response.redirect(appOrigin, 302);
}

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const itemId = url.searchParams.get("id");
  const storeId = url.searchParams.get("store");
  const appOrigin = url.searchParams.get("origin") || "";
  const isCrawler =
    CRAWLER_UA.test(req.headers.get("user-agent") || "") || url.searchParams.get("debug") === "1";
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (storeId) {
    // "/l", not "/" - Vercel always serves the static index.html
  // directly for the exact root path and never even runs
  // vercel.json's rewrites for it, so og:url (which crawlers treat as
  // canonical and re-fetch) must point somewhere the rewrite actually
  // reaches, or a re-scrape loops right back to the plain homepage.
  const appUrl = appOrigin ? `${appOrigin}/l?store=${storeId}` : `/l?store=${storeId}`;
    if (!isCrawler && appOrigin) return Response.redirect(appUrl, 302);

    const { data: user } = await supabase
      .from("users")
      .select("name, avatar_url, bio, city")
      .eq("id", storeId)
      .maybeSingle();
    if (!user) return goHome(appOrigin);

    const title = escapeHtml(user.name ? `${user.name}'s Store` : "Store on Lendeia");
    const descParts = [user.bio, user.city].filter(Boolean);
    const description = escapeHtml(
      descParts.length ? descParts.join(" - ") : "See what this owner has listed for rent on Lendeia."
    );
    const logoFallback = appOrigin ? `${appOrigin}/apple-touch-icon.png` : null;
    const images = user.avatar_url ? [user.avatar_url] : logoFallback ? [logoFallback] : [];
    return htmlResponse(renderHtml(title, description, images, appUrl, { ogType: "profile" }));
  }

  if (!itemId) {
    return new Response("Missing item id or store id", { status: 400 });
  }

  // Same "/l" reasoning as the store branch above.
  const appUrl = appOrigin ? `${appOrigin}/l?item=${itemId}` : `/l?item=${itemId}`;
  if (!isCrawler && appOrigin) return Response.redirect(appUrl, 302);

  const { data: listing } = await supabase
    .from("listings")
    .select("name, description, primary_image_url, photo_urls, price_per_day, location, is_active")
    .eq("id", itemId)
    .maybeSingle();
  if (!listing || !listing.is_active) return goHome(appOrigin);

  const title = escapeHtml(listing.name || "Item on Lendeia");
  const baseDescription = listing.description
    ? listing.description.slice(0, 180)
    : `PHP ${listing.price_per_day}/day - rent it on Lendeia.`;
  const description = escapeHtml(
    listing.location ? `${baseDescription} - ${listing.location}` : baseDescription
  );
  // The listing's FIRST photo leads (that's what the card shows);
  // any further photos follow as extra og:image entries.
  const logoFallback = appOrigin ? `${appOrigin}/apple-touch-icon.png` : null;
  const photos: string[] = Array.from(
    new Set([...(listing.photo_urls || []), listing.primary_image_url].filter(Boolean))
  );
  const images: string[] = photos.length ? photos : logoFallback ? [logoFallback] : [];

  return htmlResponse(renderHtml(title, description, images, appUrl));
});
