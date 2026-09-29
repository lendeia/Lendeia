// ==================================================================
// FILE TYPE : COMPONENT
// PURPOSE   :
//   Footer with real links — legal/policy pages, and Contact & Support
//   (styled to match the dark section that used to live on the removed
//   Welcome page — see App.jsx's header comment for why Welcome was
//   removed). Ported that section's content here since it had real
//   value (support email, report links, help/FAQ) — but most of those
//   were actually fake, non-functional <span>s styled to look
//   clickable, same issue fixed elsewhere before. All of them are real
//   buttons now, going to the actual Help & Support page.
// CONNECTS TO :
//   Rendered once by MainLayout.jsx, which passes through goToLegal and
//   goToHelp from App.jsx.
// ==================================================================
import React from "react";
import { Mail, MessageCircle, AlertCircle, Search, Facebook } from "lucide-react";

const LEGAL_LINKS = [
  ["terms", "Terms & Conditions"],
  ["privacy", "Privacy Policy"],
  ["rental-terms", "Rental Terms"],
  ["cancellation", "Cancellation & Refund"],
  ["damage", "Damage & Late Return"],
  ["owner-agreement", "Owner Agreement"],
  ["community", "Community Guidelines"],
  ["prohibited", "Prohibited Items"],
  ["disputes", "Dispute Resolution"],
];

export default function Footer({ goToLegal, goToHelp }) {
  return (
    <footer className="bg-[#17231D] text-white px-6 md:px-16 py-14 pb-28 md:pb-14">
      <div className="max-w-5xl mx-auto">
        <h2 className="font-serif text-[22px] md:text-[26px] mb-8">Contact & Support</h2>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-x-8 gap-y-4 text-[14px]">
          <a href="mailto:support@lendeia.app" className="flex items-center gap-2.5 text-white/85 hover:text-white hover:translate-x-1 transition-all">
            <Mail size={16} className="text-[#E2932E]" /> support@lendeia.app
          </a>
          <button onClick={() => goToHelp?.()} className="flex items-center gap-2.5 text-white/85 hover:text-white hover:translate-x-1 transition-all text-left">
            <MessageCircle size={16} className="text-[#E2932E]" /> Customer support
          </button>
          <button onClick={() => goToHelp?.()} className="flex items-center gap-2.5 text-white/85 hover:text-white hover:translate-x-1 transition-all text-left">
            <AlertCircle size={16} className="text-[#E2932E]" /> Report a listing
          </button>
          <button onClick={() => goToHelp?.()} className="flex items-center gap-2.5 text-white/85 hover:text-white hover:translate-x-1 transition-all text-left">
            <AlertCircle size={16} className="text-[#E2932E]" /> Report a user
          </button>
          <button onClick={() => goToHelp?.()} className="flex items-center gap-2.5 text-white/85 hover:text-white hover:translate-x-1 transition-all text-left">
            <Search size={16} className="text-[#E2932E]" /> Help / FAQ
          </button>
          {/* Real business Facebook page — opens in a new tab, same as
              any other external link, so people don't lose their place
              on the site. */}
          <a
            href="https://www.facebook.com/share/1EjR5TH8pP/?mibextid=wwXIfr"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-2.5 text-white/85 hover:text-white hover:translate-x-1 transition-all"
          >
            <Facebook size={16} className="text-[#E2932E]" /> Lendeia on Facebook
          </a>
        </div>

        <div className="flex flex-wrap gap-x-4 gap-y-1.5 mt-8 pt-6 border-t border-white/10 text-[12.5px] text-white/60">
          <span className="font-medium text-white/85">Legal</span>
          {LEGAL_LINKS.map(([id, label]) => (
            <button key={id} onClick={() => goToLegal?.(id)} className="hover:text-white hover:underline transition-colors">
              {label}
            </button>
          ))}
        </div>

        <p className="text-[12.5px] text-white/50 mt-6">
          Lendeia<span className="text-[#E2932E]">.</span> © {new Date().getFullYear()} — Rent items. Earn from your own.
        </p>
      </div>
    </footer>
  );
}
