// ==================================================================
// FILE TYPE : PAGE (RETIRED / UNREACHABLE — see note below)
// PURPOSE   :
//   Login screen: choice between (disabled) Google OAuth and an email/name
//   form. Was previously rendered by Profile.jsx when `account` was null;
//   Profile.jsx no longer does that (see state/auth/authStore.jsx and
//   Profile.jsx's own header comments for why — this form's login() call
//   used to produce a non-UUID account.id that broke real Supabase writes).
//   `useAuth()` no longer exposes `login` at all, so if anything ever
//   renders <LoginScreen> again it will crash on `const { login } = useAuth()`
//   below — that's intentional, as a loud failure instead of quietly
//   reintroducing the bug. AnimStyles is still used by Profile.jsx directly.
// CONNECTS TO :
//   Nothing currently renders this component. AnimStyles (exported below)
//   is still imported by nothing else right now either, but was written
//   to be reusable by Profile.jsx if needed.
// ==================================================================
import React, { useState } from "react";
import { Mail } from "lucide-react";
import { useAuth } from "../../../state/auth/authStore";

// Pure tools & equipment photos (verified working Unsplash URLs)
const FLOAT_PHOTOS = [
  "https://images.unsplash.com/photo-1581147036324-c1c89c2c8b5f?w=300&q=60",
  "https://images.unsplash.com/photo-1572981779307-38b8cabb2407?w=300&q=60",
  "https://images.unsplash.com/photo-1530124566582-a618bc2615dc?w=300&q=60",
  "https://images.unsplash.com/photo-1591129841117-3adfd313e34f?w=300&q=60",
  "https://images.unsplash.com/photo-1609205807107-e8ec2120f9de?w=300&q=60",
  "https://images.unsplash.com/photo-1620230874645-e0e4a4d0cc2b?w=300&q=60",
];

const FLOAT_POSITIONS = [
  { top: "4%", left: "2%", width: "150px", height: "108px", rotate: "-6deg" },
  { top: "8%", right: "2%", width: "165px", height: "118px", rotate: "5deg" },
  { top: "44%", left: "0%", width: "130px", height: "95px", rotate: "3deg" },
  { top: "48%", right: "0%", width: "145px", height: "104px", rotate: "-4deg" },
  { bottom: "10%", left: "4%", width: "155px", height: "112px", rotate: "4deg" },
  { bottom: "6%", right: "3%", width: "135px", height: "98px", rotate: "-5deg" },
];

// ---- SECTION: shared CSS keyframes (also reused by Profile.jsx) ----
export const AnimStyles = () => (
  <style>{`
    @keyframes fadeSlideUp {
      from { opacity: 0; transform: translateY(14px); }
      to { opacity: 1; transform: translateY(0); }
    }
    @keyframes fadeIn {
      from { opacity: 0; }
      to { opacity: 1; }
    }
    @keyframes popIn {
      0% { opacity: 0; transform: scale(0.7); }
      60% { opacity: 1; transform: scale(1.08); }
      100% { transform: scale(1); }
    }
    @keyframes checkDraw {
      from { stroke-dashoffset: 24; }
      to { stroke-dashoffset: 0; }
    }
    @keyframes floatA {
      0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); }
      50% { transform: translateY(-16px) rotate(var(--r, 0deg)); }
    }
    @keyframes floatB {
      0%, 100% { transform: translateY(0) rotate(var(--r, 0deg)); }
      50% { transform: translateY(14px) rotate(var(--r, 0deg)); }
    }
    @keyframes meshDrift {
      0%, 100% { transform: translate(0,0) rotate(0deg); }
      50% { transform: translate(-3%,2%) rotate(2deg); }
    }
    @keyframes ringPulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(226,147,46,0.25); }
      50% { box-shadow: 0 0 0 8px rgba(226,147,46,0); }
    }
    .anim-fade-up { animation: fadeSlideUp 0.5s cubic-bezier(0.22,1,0.36,1) both; }
    .anim-fade-in { animation: fadeIn 0.4s ease both; }
    .anim-pop { animation: popIn 0.45s cubic-bezier(0.22,1,0.36,1) both; }
    .anim-check path { stroke-dasharray: 24; stroke-dashoffset: 24; animation: checkDraw 0.4s 0.1s ease forwards; }
    .btn-press { transition: transform 0.15s ease, box-shadow 0.15s ease; }
    .btn-press:active { transform: scale(0.97); }
    .btn-press:hover { box-shadow: 0 4px 14px rgba(23,35,29,0.08); }
    .float-img { transition: opacity 0.3s ease; }
    .float-img-0 { animation: floatA 7s ease-in-out infinite; }
    .float-img-1 { animation: floatB 8.5s ease-in-out infinite; }
    .float-img-2 { animation: floatB 6.5s ease-in-out infinite; }
    .float-img-3 { animation: floatA 9s ease-in-out infinite; }
    .mesh-drift { animation: meshDrift 14s ease-in-out infinite; }
    .avatar-ring { animation: ringPulse 2.6s ease-in-out infinite; }
  `}</style>
);

// ---- SECTION: sub-component — decorative floating-photo background ----
function BackgroundArt() {
  return (
    <div style={{ position: "absolute", inset: 0, overflow: "hidden", pointerEvents: "none", zIndex: 0 }}>
      <div
        className="mesh-drift"
        style={{
          position: "absolute",
          inset: "-20%",
          background:
            "radial-gradient(circle at 20% 20%, rgba(226,147,46,0.2) 0%, transparent 45%)," +
            "radial-gradient(circle at 80% 15%, rgba(107,143,107,0.16) 0%, transparent 45%)," +
            "radial-gradient(circle at 30% 85%, rgba(226,147,46,0.14) 0%, transparent 45%)," +
            "radial-gradient(circle at 85% 80%, rgba(107,143,107,0.18) 0%, transparent 45%)",
          filter: "blur(40px)",
        }}
      />
      <div
        style={{
          position: "absolute",
          inset: 0,
          opacity: 0.05,
          backgroundImage: "radial-gradient(#17231D 1px, transparent 1px)",
          backgroundSize: "20px 20px",
        }}
      />
      {FLOAT_PHOTOS.map((src, i) => {
        const pos = FLOAT_POSITIONS[i];
        return (
          <div
            key={src}
            className={`float-img float-img-${i % 4}`}
            style={{
              position: "absolute",
              width: pos.width,
              height: pos.height,
              borderRadius: "16px",
              overflow: "hidden",
              opacity: 0.55,
              boxShadow: "0 12px 32px rgba(23,35,29,0.18)",
              top: pos.top,
              bottom: pos.bottom,
              left: pos.left,
              right: pos.right,
              "--r": pos.rotate,
              background: "#e5e2d8",
            }}
          >
            <img
              src={src}
              style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
              onError={(e) => { e.currentTarget.parentElement.style.opacity = "0"; }}
            />
          </div>
        );
      })}
      <div
        style={{
          position: "absolute",
          inset: 0,
          background:
            "radial-gradient(ellipse 55% 48% at 50% 52%, rgba(246,244,238,0.97) 0%, rgba(246,244,238,0.75) 50%, rgba(246,244,238,0.35) 100%)",
        }}
      />
    </div>
  );
}

// ---- SECTION: MAIN component — Login screen (Google/email choice + email form) ----
export default function LoginScreen({ onLogin }) {
  const { login } = useAuth();
  const [mode, setMode] = useState("choose"); // "choose" | "email-form"
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(false);

  const handleGoogleLogin = () => {
    // NOTE: no real Google OAuth is wired up in this app yet — there is no
    // registered OAuth client or provider (Firebase/Supabase/Auth0) connected.
    // A genuine "Continue with Google" requires that setup. This is disabled
    // rather than faking a successful login with made-up data.
    setError("Google sign-in isn't connected yet. Please use email to continue.");
  };

  const handleEmailSubmit = async (e) => {
    e.preventDefault();
    setError(null);

    if (!name.trim()) {
      setError("Please enter your name.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email.");
      return;
    }

    setLoading("email");
    try {
      const user = await login({ name: name.trim(), email: email.trim() });
      setSuccess(true);
      setTimeout(() => onLogin(user), 700);
    } catch (err) {
      setError(err.message || "Something went wrong. Please try again.");
    } finally {
      setLoading(null);
    }
  };

  if (success) {
    return (
      <div className="relative w-full py-24 text-center overflow-hidden">
        <AnimStyles />
        <div className="w-16 h-16 rounded-full bg-[#E2932E]/12 flex items-center justify-center mx-auto anim-pop" style={{ position: "relative", zIndex: 1 }}>
          <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="anim-check">
            <path d="M4 12.5l5 5L20 6" stroke="#E2932E" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <p className="text-[14px] text-[#6b6f66] mt-4 anim-fade-in" style={{ animationDelay: "0.2s", position: "relative", zIndex: 1 }}>
          Welcome back
        </p>
      </div>
    );
  }

  return (
    <div className="relative w-full min-h-[600px] overflow-hidden">
      <AnimStyles />
      <BackgroundArt />

      <div className="relative px-6 md:px-12 py-16 max-w-sm mx-auto text-center" style={{ zIndex: 1 }}>
        <div
          className="w-14 h-14 rounded-full bg-[#17231D]/6 flex items-center justify-center mx-auto anim-fade-up ring-1 ring-[#17231D]/8"
          style={{ animationDelay: "0.05s" }}
        >
          <span className="font-serif text-[20px] text-[#17231D]">R</span>
        </div>
        <h1 className="font-serif text-[22px] text-[#17231D] mt-4 anim-fade-up" style={{ animationDelay: "0.12s" }}>
          Log in to Lendeia
        </h1>
        <p className="text-[13.5px] text-[#6b6f66] mt-1 anim-fade-up" style={{ animationDelay: "0.18s" }}>
          Rent and list equipment near you
        </p>

        <div
          className="mt-8 rounded-2xl bg-white/90 backdrop-blur-md border border-[#17231D]/8 p-4 anim-fade-up shadow-[0_8px_30px_rgba(23,35,29,0.12)]"
          style={{ animationDelay: "0.22s" }}
        >
          {mode === "choose" ? (
            <div className="flex flex-col gap-3">
              <button
                onClick={handleGoogleLogin}
                className="btn-press w-full flex items-center justify-center gap-3 rounded-xl border border-[#17231D]/12 bg-white px-4 py-3 text-[14px] font-medium text-[#17231D]"
              >
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/>
                  <path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.6 16 19 13 24 13c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.6 6 29.6 4 24 4 16.3 4 9.7 8.3 6.3 14.7z"/>
                  <path fill="#4CAF50" d="M24 44c5.5 0 10.4-1.9 14.3-5.1l-6.6-5.6c-2 1.5-4.6 2.4-7.7 2.4-5.2 0-9.6-3.3-11.2-7.9l-6.6 5.1C9.6 39.6 16.2 44 24 44z"/>
                  <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.3-4.1 5.7l6.6 5.6C41.9 35.9 44 30.4 44 24c0-1.3-.1-2.7-.4-3.5z"/>
                </svg>
                Continue with Google
              </button>

              <button
                onClick={() => { setMode("email-form"); setError(null); }}
                className="btn-press w-full flex items-center justify-center gap-3 rounded-xl border border-[#17231D]/12 bg-white px-4 py-3 text-[14px] font-medium text-[#17231D]"
              >
                <Mail size={17} />
                Continue with Email
              </button>

              {error && <p className="text-[12.5px] text-red-600 mt-1">{error}</p>}
            </div>
          ) : (
            <form onSubmit={handleEmailSubmit} className="flex flex-col gap-3 text-left">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Your name"
                className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none"
              />
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                className="w-full rounded-xl border border-[#17231D]/12 px-4 py-3 text-[14px] outline-none"
              />

              {error && <p className="text-[12.5px] text-red-600">{error}</p>}

              <button
                type="submit"
                disabled={!!loading}
                className="btn-press w-full rounded-xl bg-[#17231D] text-white px-4 py-3 text-[14px] font-medium disabled:opacity-60"
              >
                {loading === "email" ? "Signing in…" : "Continue"}
              </button>
              <button
                type="button"
                onClick={() => { setMode("choose"); setError(null); }}
                className="text-[13px] text-[#6b6f66] underline self-center"
              >
                Back
              </button>
            </form>
          )}
        </div>

        <p className="text-[12px] text-[#6b6f66] mt-6 leading-relaxed anim-fade-up" style={{ animationDelay: "0.36s" }}>
          By continuing, you agree to Lendeia's Terms of Service and Privacy Policy.
        </p>
      </div>
    </div>
  );
}