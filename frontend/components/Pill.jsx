// ==================================================================
// FILE TYPE : COMPONENT
// PURPOSE   :
//   Small rounded label/badge with color 'tone' presets. Restyled to
//   match the modern design system — flat tinted fills instead of
//   glossy gradients, matching Button.jsx/MainLayout.jsx's restrained
//   approach. Same tone names/API as before, every existing call site
//   keeps working unchanged.
// CONNECTS TO :
//   Used by Details.jsx (category) and Dashboard.jsx (rental status).
// ==================================================================
import React from "react";

export default function Pill({ children, tone = "default" }) {
  const tones = {
    default: "bg-[#17231D]/[0.06] text-[#17231D]",
    amber: "bg-[#E2932E]/15 text-[#8a5a13]",
    moss: "bg-[#4B5D46]/12 text-[#4B5D46]",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[12.5px] font-medium ${tones[tone]}`}>
      {children}
    </span>
  );
}
