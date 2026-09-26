// ==================================================================
// FILE TYPE : COMPONENT
// PURPOSE   :
//   Generic styled <button> with variant presets (primary/accent/outline/ghost).
//   Restyled to match the modern design system (see
//   frontend/layouts/MainLayout.jsx) — solid fills, a restrained shadow,
//   a small confident lift on hover/press via the shared .btn-modern
//   class, no decorative gloss overlay. Kept the same variant NAMES and
//   prop API as before so every existing call site keeps working
//   unchanged.
// CONNECTS TO :
//   Used across nearly every page.
// ==================================================================
import React from "react";

export default function Button({ children, variant = "primary", className = "", ...props }) {
  const base =
    "btn-modern inline-flex items-center justify-center gap-2 rounded-full font-medium px-5 py-3 text-[14.5px]";
  const styles = {
    primary: "text-white bg-[#17231D] hover:bg-[#243830] shadow-[0_1px_2px_rgba(23,35,29,0.15),0_6px_16px_rgba(23,35,29,0.18)]",
    accent: "text-[#17231D] bg-[#E2932E] hover:bg-[#d6851f] shadow-[0_1px_2px_rgba(226,147,46,0.2),0_6px_16px_rgba(226,147,46,0.25)]",
    outline: "text-[#17231D] bg-white border border-[#17231D]/15 hover:border-[#17231D]/30 hover:bg-[#17231D]/[0.02]",
    ghost: "text-[#17231D] hover:bg-[#17231D]/5",
  };
  return (
    <button className={`${base} ${styles[variant]} ${className}`} {...props}>
      {children}
    </button>
  );
}
