// ==================================================================
// FILE TYPE : LAYOUT
// PURPOSE   :
//   Shared page chrome: loads the Fraunces/Inter font link, injects the
//   global design system (spacing/elevation/motion conventions below),
//   renders Navbar + page content + Footer.
//
//   DESIGN SYSTEM: a clean, modern "company-level" look (subtle
//   shadows, confident whitespace, smooth purposeful motion — closer to
//   Linear/Stripe/Vercel than to any particular decorative theme),
//   replacing the earlier glossy "Frutiger Aero" pass. Defines reusable
//   utility classes (.card, .card-hover, .btn-modern, .fade-in-up,
//   .stagger-children) applied here + in Button.jsx, Pill.jsx,
//   Navbar.jsx, ListingCard.jsx, Home.jsx. DELIBERATELY SCOPED, not an
//   app-wide rewrite in one pass — see the response that introduced this
//   for exactly which pages got the full treatment vs. which still use
//   the prior styling and are a natural next step.
// CONNECTS TO :
//   Used by frontend/layouts/DashboardLayout.jsx and indirectly by every page
//   via App.jsx's <MainLayout>. Navbar.jsx, Button.jsx, Pill.jsx,
//   ListingCard.jsx, and Home.jsx consume the classes defined here.
// ==================================================================
import React, { useState } from "react";
import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import { FONT_LINK } from "../../shared/constants";
import { useMyLocation } from "../../state/location/locationStore";
import { LocateFixed, X } from "lucide-react";

const LOCATION_BANNER_DISMISSED_KEY = "renta_location_banner_dismissed";

// One clear, unmissable, site-wide prompt for enabling location —
// previously every page that used location (Home, Browse, Details,
// Map, Profile) had its OWN small inline "Enable location" link, easy
// to miss entirely if a new user's first page happened not to need it
// yet, or just didn't notice it. This shows once, everywhere, until
// either granted or explicitly dismissed, so there's exactly one place
// a confused new user needs to find, not several scattered ones.
function LocationBanner() {
  const { coords, loading, requestLocation } = useMyLocation();
  const [dismissed, setDismissed] = useState(() => {
    try { return localStorage.getItem(LOCATION_BANNER_DISMISSED_KEY) === "true"; } catch { return false; }
  });

  if (coords || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try { localStorage.setItem(LOCATION_BANNER_DISMISSED_KEY, "true"); } catch {}
  };

  return (
    <div className="bg-[#4B5D46]/10 border-b border-[#4B5D46]/20 px-4 py-2.5 flex items-center justify-center gap-3 text-[13px] text-[#17231D] text-center">
      <LocateFixed size={15} className="text-[#4B5D46] shrink-0" />
      <span>
        Location is off. Turn it on to see items near you, real distances, and the map.
      </span>
      <button
        onClick={requestLocation}
        disabled={loading}
        className="shrink-0 px-3 py-1 rounded-full bg-[#4B5D46] text-white font-medium disabled:opacity-60"
      >
        {loading ? "Locating…" : "Enable location"}
      </button>
      <button onClick={dismiss} className="shrink-0 text-[#8A9089] hover:text-[#17231D]" title="Dismiss">
        <X size={15} />
      </button>
    </div>
  );
}


export default function MainLayout({ page, setPage, children, goToLegal, goToHelp }) {
  return (
    <div style={{ fontFamily: "Inter, sans-serif" }} className="modern-bg min-h-screen text-[#17231D]">
      <link href={FONT_LINK} rel="stylesheet" />
      <style>{`
        .font-serif { font-family: 'Fraunces', serif; }

        /* ---- Modern design system ---- */

        /* Clean, quiet background — a near-white neutral with an
           extremely subtle warm tint, instead of a busy gradient. Modern
           SaaS products keep the canvas quiet and let content/shadows
           carry the visual weight. */
        .modern-bg {
          background: #FAFAF8;
        }

        /* Standard elevated surface — replaces both the old flat white
           cards and the glossy glass panels. A soft, tight shadow (not
           a glow) plus a barely-visible border reads as "a real object
           sitting slightly above the page," the way modern interfaces
           consistently do it. */
        .card {
          background: #ffffff;
          border: 1px solid rgba(23, 35, 29, 0.07);
          border-radius: 16px;
          box-shadow: 0 1px 2px rgba(23, 35, 29, 0.04), 0 4px 16px rgba(23, 35, 29, 0.05);
        }

        /* Applied alongside .card for anything clickable/interactive —
           a small, confident lift with a slightly stronger shadow,
           using a consistent easing curve everywhere in the app rather
           than ad-hoc per-component transitions. */
        .card-hover {
          transition: transform 0.22s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.22s cubic-bezier(0.22, 1, 0.36, 1), border-color 0.22s ease;
        }
        .card-hover:hover {
          transform: translateY(-3px);
          box-shadow: 0 2px 4px rgba(23, 35, 29, 0.05), 0 12px 28px rgba(23, 35, 29, 0.10);
          border-color: rgba(23, 35, 29, 0.12);
        }

        /* Standard button base — solid fill, no gimmicks, a small
           consistent press/lift on hover. Real products use restraint
           here; the earlier glossy "shine" overlay is gone. */
        .btn-modern {
          transition: transform 0.15s cubic-bezier(0.22, 1, 0.36, 1), box-shadow 0.15s ease, background-color 0.15s ease;
        }
        .btn-modern:hover { transform: translateY(-1px); }
        .btn-modern:active { transform: translateY(0) scale(0.98); }

        /* One shared entrance animation, used consistently instead of
           each page inventing its own — a small, quick, purposeful
           fade+rise, not a flashy flourish. */
        @keyframes fadeInUp {
          from { opacity: 0; transform: translateY(10px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .fade-in-up {
          animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both;
        }

        /* Staggers .fade-in-up children in a grid/list by giving each
           successive child a slightly later start — the same technique
           used everywhere content loads in as a set (card grids,
           dashboards) rather than all at once, which reads as more
           deliberate/crafted. Apply .stagger-children to the parent. */
        .stagger-children > * { animation: fadeInUp 0.5s cubic-bezier(0.22, 1, 0.36, 1) both; }
        .stagger-children > *:nth-child(1) { animation-delay: 0.03s; }
        .stagger-children > *:nth-child(2) { animation-delay: 0.06s; }
        .stagger-children > *:nth-child(3) { animation-delay: 0.09s; }
        .stagger-children > *:nth-child(4) { animation-delay: 0.12s; }
        .stagger-children > *:nth-child(5) { animation-delay: 0.15s; }
        .stagger-children > *:nth-child(6) { animation-delay: 0.18s; }
        .stagger-children > *:nth-child(7) { animation-delay: 0.21s; }
        .stagger-children > *:nth-child(8) { animation-delay: 0.24s; }

        /* Consistent, visible keyboard focus ring — a real product
           detail that's easy to skip. Matches the brand's moss-green
           rather than the browser default blue. */
        .modern-bg :focus-visible {
          outline: 2px solid rgba(75, 93, 70, 0.5);
          outline-offset: 2px;
        }
      `}</style>

      <Navbar page={page} setPage={setPage} />

      <main className="pt-[60px] md:pt-[72px] relative">
        <LocationBanner />
        {children}
      </main>

      {/* Messages uses fixed positioning on mobile (see Messages.jsx) —
          <main> collapses to near-zero height there since its child is
          taken out of normal flow, which would otherwise place the
          footer visually behind/overlapping the fixed chat panel. A
          footer doesn't belong on a full-screen chat view anyway. */}
      {page !== "messages" && <Footer goToLegal={goToLegal} goToHelp={goToHelp} />}
    </div>
  );
}