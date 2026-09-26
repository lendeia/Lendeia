// ==================================================================
// FILE TYPE : SHARED CONSTANTS
// PURPOSE   :
//   Design tokens (colors/fonts) and static content (hero image, category list)
//   shared between frontend pages so they don't duplicate magic strings.
// CONNECTS TO :
//   CATEGORIES is used by Home.jsx, Browse.jsx and ListEquipment.jsx.
//   FONT_LINK is injected once by frontend/layouts/MainLayout.jsx.
// ==================================================================
/* ---------------- Design tokens ----------------
Ink:   #17231D  (deep pine-black)
Paper: #F6F4EE  (warm paper)
Amber: #E2932E  (equipment accent)
Moss:  #4B5D46  (secondary green)
Steel: #8A9089  (neutral)
Line:  #E4E0D4
Type: display serif "Fraunces", body "Inter"
------------------------------------------------- */

// IMG.hero moved into Home.jsx directly (now a rotating slideshow of 4
// real photos, matching Welcome.jsx's hero — importing image assets
// belongs closer to where they're used, not routed through this
// lightweight shared-tokens file).

export const FONT_LINK =
  "https://fonts.googleapis.com/css2?family=Fraunces:opsz,wght@9..144,400;9..144,500;9..144,600&family=Inter:wght@400;500;600;700&display=swap";

export const CATEGORIES = [
  { name: "Equipment", icon: "🛠️" },
  { name: "Gadgets & Electronics", icon: "📱" },
  { name: "Tools", icon: "🔧" },
  { name: "Power Tools", icon: "⚡" },
];