// ==================================================================
// FILE TYPE : PAGE (new — full-bleed, rendered OUTSIDE MainLayout)
// PURPOSE   :
//   Commercial-style landing/welcome page shown before the main app —
//   hero (rotating photo slideshow), what-we-do, services (hover-swap
//   image cards), why-choose-us, how-it-works (animated step reveal),
//   about, contact/support/legal links. Purely informational/marketing;
//   no data fetching, no auth requirement. Ends with a single "Explore
//   Marketplace" action that hands control to App.jsx to switch into
//   the real app (Home, inside MainLayout/Navbar).
//
//   All animation here is plain CSS (keyframes injected once via the
//   <style> tag below, same pattern already used by
//   frontend/pages/Login/Login.jsx's AnimStyles) plus a small
//   IntersectionObserver hook for scroll-reveal — no animation library
//   was added, to avoid a new dependency for a purely visual feature.
//
//   Icon choices are restricted to ones already imported successfully
//   elsewhere in this codebase (see CONNECTS TO) rather than newer/
//   less-common lucide-react icons this environment couldn't verify are
//   present in the installed package version.
// CONNECTS TO :
//   Rendered by frontend/App.jsx BEFORE MainLayout — it deliberately has
//   no Navbar/Footer of its own. Icons already proven elsewhere: Search
//   (Browse.jsx), MapPin (Details.jsx), ShieldCheck (ListEquipment.jsx),
//   MessageCircle (OwnerStore.jsx), Mail/AlertCircle (Dashboard.jsx),
//   Check (Home.jsx), ClipboardList/Grid/ChevronRight/User (Navbar.jsx).
// ==================================================================
import React, { useEffect, useRef, useState } from "react";
// Real product photos you provided — replaced the earlier hand-drawn
// placeholder illustrations (kept here only as a comment for history:
// those were a stopgap after two rounds of guessed stock-photo IDs
// turned out wrong, since this environment can't browse to preview
// image URLs — these are the real, correct photos instead).
import cameraPhoto from "../../assets/items/camera.jpg";
import pressureWasherPhoto from "../../assets/items/pressure-washer.jpg";
import grassTrimmerPhoto from "../../assets/items/grass-trimmer.jpg";
import tentPhoto from "../../assets/items/tent.jpg";

// Real photos, each dedicated to its own service caption (replacing the
// earlier reuse of the 4 item photos above, which didn't specifically
// relate to these more abstract feature concepts).
import rentalMarketplacePhoto from "../../assets/services/rental-marketplace.jpg";
import ownerListingsPhoto from "../../assets/services/owner-listings.png";
import directCommunicationPhoto from "../../assets/services/direct-communication.jpg";
import locationBasedDiscoveryPhoto from "../../assets/services/location-based-discovery.jpg";
import trustAndSafetyPhoto from "../../assets/services/trust-and-safety.jpg";
import accessibleMarketplacePhoto from "../../assets/services/accessible-marketplace.jpg";

// Custom icon illustrations for the "Our Services" section — each one
// hand-designed to actually depict its own caption (a storefront for
// "Rental Marketplace," a shield+checkmark for "Trust & Safety," etc.)
// rather than reusing the 4 item photos above, which don't relate to
// these more abstract feature concepts.
// Custom drawn icons for "Our Services" were replaced — real product
// photography reads as more premium than line-art illustration for this
// card style, so these 6 cards now reuse the same 4 real photos as the
// hero instead.
import {
  ChevronRight,
  Search,
  User,
  MessageCircle,
  MapPin,
  ShieldCheck,
  Grid,
  Check,
  ClipboardList,
  Mail,
  AlertCircle,
} from "lucide-react";

// ---- SECTION: real photos — multiple, distinct per section (was a single reused hero image) ----
// Minimalist product-style photography — items shot clean and simple
// (soft neutral backgrounds, generous negative space, single subject),
// replacing the earlier rugged workshop/tool photography, to match the
// new restrained "modern/company-level" design direction rather than
// clash with it. Still items-only, no people, per the original request
// that shaped this set.
// Hero slideshow + About section — your real product photos.
const HERO_IMAGES = [cameraPhoto, tentPhoto, pressureWasherPhoto, grassTrimmerPhoto];

const ABOUT_IMAGE = cameraPhoto;

// Real photos, each one dedicated to its own service caption — no more
// reuse/repetition across cards. Each card shows its one photo
// full-bleed (object-cover, fixed height) with a simple hover zoom —
// no more crossfade-to-a-second-photo, since there's no second photo
// per service anymore.
const SERVICES = [
  {
    icon: Search,
    title: "Rental Marketplace",
    desc: "Discover items available for rent from different owners.",
    img: rentalMarketplacePhoto,
  },
  {
    icon: User,
    title: "Owner Listings",
    desc: "Give owners a place to showcase their available items.",
    img: ownerListingsPhoto,
  },
  {
    icon: MessageCircle,
    title: "Direct Communication",
    desc: "Allow renters and owners to communicate about rental details.",
    img: directCommunicationPhoto,
  },
  {
    icon: MapPin,
    title: "Location-Based Discovery",
    desc: "Find rental opportunities based on available locations.",
    img: locationBasedDiscoveryPhoto,
  },
  {
    icon: ShieldCheck,
    title: "Trust & Safety",
    desc: "Features and policies designed to help reduce scams and risky transactions.",
    img: trustAndSafetyPhoto,
  },
  {
    icon: Grid,
    title: "Accessible Marketplace",
    desc: "Built to make renting accessible across different locations as the platform grows.",
    img: accessibleMarketplacePhoto,
  },
];

const WHY_US = [
  "Easy-to-understand listings",
  "Direct connection between renters and owners",
  "Transparent rental information",
  "Accessible marketplace",
  "Focus on reducing rental scams and misleading listings",
];

const STEPS = [
  { icon: Search, label: "Discover" },
  { icon: MessageCircle, label: "Connect" },
  { icon: ClipboardList, label: "Agree" },
  { icon: Check, label: "Rent" },
];

// ---- SECTION: helper hook — scroll-reveal via IntersectionObserver ----
// Plain-JS/CSS alternative to a full animation library: a section only
// gets its "in view" class the first time it scrolls into the viewport,
// which is what triggers the fade/slide/scale-in CSS transition defined
// in the <style> block below.
function useReveal() {
  const ref = useRef(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setVisible(true);
          observer.disconnect();
        }
      },
      { threshold: 0.15 }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return [ref, visible];
}

function Reveal({ children, className = "", as: Tag = "div", style }) {
  const [ref, visible] = useReveal();
  return (
    <Tag ref={ref} style={style} className={`reveal ${visible ? "reveal-in" : ""} ${className}`}>
      {children}
    </Tag>
  );
}

// ---- SECTION: sub-component — service card with hover image-swap + tilt/lift ----
function ServiceCard({ icon: Icon, title, desc, img, delay }) {
  const cardRef = useRef(null);

  // Subtle 3D tilt that follows the cursor — this is the "aimed by mouse"
  // interaction: the card leans toward the pointer instead of just
  // sitting flat, on top of the image crossfade below.
  const handleMouseMove = (e) => {
    const el = cardRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width - 0.5;
    const y = (e.clientY - rect.top) / rect.height - 0.5;
    el.style.setProperty("--tilt-x", `${(-y * 8).toFixed(2)}deg`);
    el.style.setProperty("--tilt-y", `${(x * 8).toFixed(2)}deg`);
  };
  const handleMouseLeave = () => {
    const el = cardRef.current;
    if (!el) return;
    el.style.setProperty("--tilt-x", "0deg");
    el.style.setProperty("--tilt-y", "0deg");
  };

  return (
    <Reveal className="service-card-reveal" style={{ transitionDelay: `${delay}ms` }}>
      <div
        ref={cardRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
        className="card card-hover service-card group cursor-default overflow-hidden"
        style={{
          transform: "perspective(800px) rotateX(var(--tilt-x, 0deg)) rotateY(var(--tilt-y, 0deg))",
        }}
      >
        {/* Full-bleed real photography — fixed height, object-cover so
            every card crops to fill the exact same box edge-to-edge
            regardless of each photo's original aspect ratio. Previously
            used object-contain with padding (an "isolated product shot"
            treatment meant for items on transparent/plain backgrounds),
            which on real photos with their own backgrounds (a store
            interior, an office hallway) showed visible empty canvas
            around each photo, and a different effective size per card
            since each source photo's aspect ratio differed. */}
        <div className="relative h-48 overflow-hidden bg-[#F3F1EB]">
          <img
            src={img}
            alt=""
            className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 ease-out group-hover:scale-110"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-black/15 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
        </div>

        <div className="p-5">
          <div className="w-9 h-9 rounded-full bg-[#4B5D46]/10 flex items-center justify-center mb-3">
            <Icon size={16} className="text-[#4B5D46]" />
          </div>
          <h3 className="font-medium text-[15.5px] text-[#17231D]">{title}</h3>
          <p className="text-[13px] text-[#6b6f66] mt-1.5 leading-relaxed">
            {desc}
          </p>
        </div>
      </div>
    </Reveal>
  );
}

// ---- SECTION: sub-component — "How It Works" steps with scroll-reveal pop-in + drawing connector line ----
function ReactRevealSteps() {
  const [ref, visible] = useReveal();
  return (
    <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-8">
      {STEPS.map(({ icon: Icon, label }, i) => (
        <div key={label} className="flex flex-col items-center text-center relative">
          {i < STEPS.length - 1 && (
            <div className="hidden md:block absolute top-8 left-[60%] w-full h-[1.5px] bg-[#17231D]/10 overflow-hidden">
              <div className={`h-full bg-[#E2932E] step-line-fill ${visible ? "reveal-in" : ""}`} />
            </div>
          )}
          <div
            className={`step-circle w-16 h-16 rounded-full bg-[#17231D] flex items-center justify-center relative z-10 ${visible ? "" : "opacity-0"}`}
            style={{
              animationDelay: `${i * 150}ms`,
              animation: visible ? "popIn 0.5s cubic-bezier(0.34,1.56,0.64,1) both" : "none",
            }}
          >
            <Icon size={24} className="text-[#E2932E]" />
          </div>
          <p className="mt-4 font-medium text-[14.5px] text-[#17231D]">{label}</p>
        </div>
      ))}
    </div>
  );
}

export default function Welcome({ onContinue, goToLegal }) {
  const [heroIdx, setHeroIdx] = useState(0);
  // Real scroll-driven parallax — the hero photo moves at a different
  // rate than the page content and gradually scales/fades as you
  // scroll past it, instead of sitting static behind the text. Tracked
  // via a rAF-throttled scroll listener (not a raw scroll handler,
  // which can fire far more often than the screen actually repaints
  // and cause jank) rather than relying on `background-attachment:
  // fixed`, which has inconsistent/no support on mobile Safari — this
  // works identically everywhere.
  const [scrollY, setScrollY] = useState(0);
  useEffect(() => {
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        setScrollY(window.scrollY);
        ticking = false;
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);
  // Clamped so the effect is only ever computed/applied across the
  // hero's own height — scrolling far past it shouldn't keep changing
  // these values pointlessly.
  const heroProgress = Math.min(scrollY / 800, 1);

  useEffect(() => {
    const id = setInterval(() => {
      setHeroIdx((i) => (i + 1) % HERO_IMAGES.length);
    }, 4500);
    return () => clearInterval(id);
  }, []);

  return (
    <div className="bg-[#FAFAF8] text-[#17231D] overflow-x-hidden">
      <style>{`
        @keyframes floatBlob {
          0%, 100% { transform: translate(0, 0) scale(1); }
          50% { transform: translate(20px, -30px) scale(1.08); }
        }
        @keyframes heroKenBurns {
          0% { transform: scale(1.05); }
          100% { transform: scale(1.18); }
        }
        @keyframes popIn {
          0% { opacity: 0; transform: scale(0.6); }
          70% { opacity: 1; transform: scale(1.08); }
          100% { opacity: 1; transform: scale(1); }
        }
        @keyframes drawLine {
          from { width: 0%; }
          to { width: 100%; }
        }
        .hero-slide { animation: heroKenBurns 6s ease-out forwards; }
        .blob { animation: floatBlob 9s ease-in-out infinite; }
        .reveal {
          opacity: 0;
          transform: translateY(28px);
          transition: opacity 0.7s cubic-bezier(0.22,1,0.36,1), transform 0.7s cubic-bezier(0.22,1,0.36,1);
        }
        .reveal-in { opacity: 1; transform: translateY(0); }
        .service-card { transition: transform 0.25s ease-out, box-shadow 0.25s ease-out; }
        .service-card:hover { box-shadow: 0 20px 45px rgba(23,51,71,0.30); }
        .step-line-fill { width: 0; transition: width 0.9s ease-out 0.2s; }
        .step-line-fill.reveal-in { width: 100%; }
      `}</style>

      {/* ---------------- 1. Hero / Welcome ---------------- */}
      {/* Now a full 100vh (up from 92vh) — a genuinely huge photo, not
          just a tall banner — with real scroll-driven parallax below. */}
      <section className="relative h-screen flex items-center overflow-hidden">
        <div
          className="absolute inset-0"
          style={{
            // The photo layer moves upward slower than the page scrolls
            // (the classic parallax depth cue) and slowly zooms/fades as
            // you scroll past it — genuinely "moves and changes," not a
            // static backdrop.
            transform: `translateY(${scrollY * 0.35}px) scale(${1 + heroProgress * 0.15})`,
            opacity: 1 - heroProgress * 0.6,
            willChange: "transform, opacity",
          }}
        >
          {HERO_IMAGES.map((src, i) => (
            <img
              key={src}
              src={src}
              alt=""
              className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${
                i === heroIdx ? "opacity-100 hero-slide" : "opacity-0"
              }`}
            />
          ))}
        </div>
        {/* Aero-blue glass overlay — replaces the previous dark moody
            gradient with a lighter, glossy sky-blue tint so the hero
            reads as "glass over a photo" rather than a dimmed photo. */}
        <div className="absolute inset-0 bg-gradient-to-t from-[#17231D]/90 via-[#17231D]/45 to-[#17231D]/10" />
        <div className="absolute inset-0 bg-gradient-to-br from-white/10 via-transparent to-transparent" />

        {/* Glossy floating orbs — the classic Aero "water droplet"
            decoration — replacing the previous flat color blobs. Also
            drift with scroll, at yet another rate, adding to the sense
            of depth/layers moving independently. */}
        <div
          className="blob absolute top-[15%] right-[10%] w-72 h-72 rounded-full bg-white/10 blur-3xl pointer-events-none"
          style={{ transform: `translateY(${scrollY * 0.15}px)` }}
        />
        <div
          className="blob absolute bottom-[10%] left-[8%] w-80 h-80 rounded-full bg-[#E2932E]/15 blur-3xl pointer-events-none"
          style={{ animationDelay: "3s", transform: `translateY(${scrollY * -0.1}px)` }}
        />

        <div
          className="relative z-10 w-full px-6 md:px-16 py-24 max-w-5xl"
          style={{
            // Content fades/lifts out slightly faster than the photo
            // itself, so the two layers visibly separate as you scroll
            // — this is what makes it read as "the photo changes," not
            // just "the photo happens to be behind some text."
            transform: `translateY(${scrollY * 0.5}px)`,
            opacity: 1 - heroProgress * 1.3,
          }}
        >
          <div className="flex items-center gap-2 mb-8">
            <span className="text-white font-serif text-[26px] tracking-tight">
              Lendeia<span className="text-[#E2932E]">.</span>
            </span>
          </div>

          <h1 className="text-white font-serif text-[44px] md:text-[76px] leading-[1.02] max-w-3xl tracking-tight">
            Rent smarter. <br className="hidden md:block" />
            Share more.
          </h1>

          <p className="text-[16px] md:text-[19px] text-white/90 mt-6 max-w-xl leading-relaxed drop-shadow-[0_2px_8px_rgba(0,0,0,0.35)]">
            A simple marketplace where people can discover useful items available for rent and
            connect directly with their owners.
          </p>

          <button
            onClick={onContinue}
            className="btn-modern mt-10 inline-flex items-center gap-2 px-7 py-4 rounded-full bg-[#E2932E] hover:bg-[#d6851f] text-[#17231D] font-semibold text-[15px] shadow-[0_2px_4px_rgba(0,0,0,0.1),0_12px_28px_rgba(226,147,46,0.35)]"
          >
            Explore Marketplace
            <ChevronRight size={18} />
          </button>

          {/* Slideshow dots */}
          <div className="flex gap-1.5 mt-10">
            {HERO_IMAGES.map((_, i) => (
              <button
                key={i}
                onClick={() => setHeroIdx(i)}
                aria-label={`Show photo ${i + 1}`}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === heroIdx ? "w-8 bg-[#E2932E]" : "w-1.5 bg-white/40"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Scroll-down cue — a small, subtle nudge that fades out as
            soon as scrolling actually begins, reinforcing that this
            page responds to scroll rather than being a static banner. */}
        <div
          className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1.5 text-white/70"
          style={{ opacity: 1 - heroProgress * 4 }}
        >
          <span className="text-[11px] tracking-[0.15em] uppercase">Scroll</span>
          <div className="w-[1px] h-8 bg-gradient-to-b from-white/70 to-transparent animate-pulse" />
        </div>
      </section>

      {/* ---------------- 2. What We Do ---------------- */}
      <Reveal as="section" className="px-6 md:px-16 py-24 max-w-3xl mx-auto text-center">
        <h2 className="font-serif text-[28px] md:text-[34px] text-[#17231D]">
          Making renting easier for everyone.
        </h2>
        <p className="text-[15.5px] md:text-[17px] text-[#4a4f45] mt-5 leading-relaxed">
          Our platform connects people who need items with owners who have items available for
          rent. We make it easier to discover, compare, and connect — without unnecessary
          complexity.
        </p>
      </Reveal>

      {/* ---------------- 3. Our Services ---------------- */}
      <section className="px-6 md:px-16 py-20 bg-white border-y border-[#17231D]/8">
        <div className="max-w-5xl mx-auto">
          <Reveal as="h2" className="font-serif text-[26px] md:text-[32px] text-center text-[#17231D] mb-12">
            Our Services
          </Reveal>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {SERVICES.map((s, i) => (
              <ServiceCard key={s.title} {...s} delay={i * 90} />
            ))}
          </div>
        </div>
      </section>

      {/* ---------------- 4. Why Choose Us ---------------- */}
      <Reveal as="section" className="px-6 md:px-16 py-24 max-w-3xl mx-auto">
        <h2 className="font-serif text-[28px] md:text-[34px] text-[#17231D] text-center">
          Simple. Accessible. Fair.
        </h2>
        <div className="mt-10 space-y-4">
          {WHY_US.map((point, i) => (
            <div
              key={point}
              className="flex items-start gap-3 transition-transform duration-300 hover:translate-x-1.5"
            >
              <span className="w-6 h-6 rounded-full bg-[#E2932E]/15 flex items-center justify-center shrink-0 mt-0.5">
                <span className="w-1.5 h-1.5 rounded-full bg-[#E2932E]" />
              </span>
              <p className="text-[15px] text-[#3c3f38]">{point}</p>
            </div>
          ))}
        </div>
        <p className="text-[12.5px] text-[#8A9089] mt-8 text-center">
          We work to reduce scams and unsafe activity — always verify rental details before
          completing a transaction.
        </p>
      </Reveal>

      {/* ---------------- 5. How It Works ---------------- */}
      <section className="px-6 md:px-16 py-20 bg-white border-y border-[#17231D]/8">
        <div className="max-w-4xl mx-auto">
          <Reveal as="h2" className="font-serif text-[26px] md:text-[32px] text-center text-[#17231D] mb-14">
            How It Works
          </Reveal>
          <ReactRevealSteps />
        </div>
      </section>

      {/* ---------------- 6. About Us ---------------- */}
      <Reveal as="section" className="px-6 md:px-16 py-24 max-w-3xl mx-auto text-center">
        <div className="rounded-2xl overflow-hidden mb-10 aspect-[16/7]">
          <img src={ABOUT_IMAGE} alt="" className="w-full h-full object-cover" />
        </div>
        <h2 className="font-serif text-[28px] md:text-[34px] text-[#17231D]">
          Built to make renting simpler.
        </h2>
        <p className="text-[15.5px] md:text-[17px] text-[#4a4f45] mt-5 leading-relaxed">
          We believe people should have an easier way to access things they need without always
          having to buy them. Our marketplace was created to connect renters and owners through a
          simple, accessible platform.
        </p>
      </Reveal>

      {/* ---------------- 7. Contact & Support ---------------- */}
      <Reveal as="section" className="px-6 md:px-16 py-20 bg-[#17231D] text-white">
        <div className="max-w-5xl mx-auto">
          <h2 className="font-serif text-[24px] md:text-[28px] mb-10">Contact & Support</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-5 text-[14px]">
            <a href="mailto:support@lendeia.app" className="flex items-center gap-2.5 text-white/85 hover:text-white hover:translate-x-1 transition-all">
              <Mail size={16} className="text-[#E2932E]" /> support@lendeia.app
            </a>
            <span className="flex items-center gap-2.5 text-white/85">
              <MessageCircle size={16} className="text-[#E2932E]" /> Customer support
            </span>
            <span className="flex items-center gap-2.5 text-white/85">
              <AlertCircle size={16} className="text-[#E2932E]" /> Report a listing
            </span>
            <span className="flex items-center gap-2.5 text-white/85">
              <AlertCircle size={16} className="text-[#E2932E]" /> Report a user
            </span>
            <span className="flex items-center gap-2.5 text-white/85">
              <Search size={16} className="text-[#E2932E]" /> Help / FAQ
            </span>
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 mt-10 pt-6 border-t border-white/10 text-[12.5px] text-white/60">
            <span>© {new Date().getFullYear()} Lendeia. All rights reserved.</span>
            {/* Previously plain <span>s styled to look exactly like
                clickable links (hover:text-white, no different from a
                real link visually) but with no onClick at all and an
                explicit cursor-default — decorative text pretending to
                be functional. Now real navigation to the actual Legal
                page's relevant sections. */}
            <button onClick={() => goToLegal?.("privacy")} className="hover:text-white transition-colors">
              Privacy Policy
            </button>
            <button onClick={() => goToLegal?.("terms")} className="hover:text-white transition-colors">
              Terms of Service
            </button>
          </div>
        </div>
      </Reveal>

      <div className="px-6 md:px-16 py-14 text-center bg-[#F6F4EE]">
        <button
          onClick={onContinue}
          className="inline-flex items-center gap-2 px-7 py-4 rounded-full bg-[#17231D] text-white font-medium text-[15px] hover:bg-[#233428] transition-all active:scale-95"
        >
          Explore Marketplace
          <ChevronRight size={18} />
        </button>
      </div>
    </div>
  );
}
