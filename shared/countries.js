// ==================================================================
// FILE TYPE : SHARED UTILITY
// PURPOSE   :
//   Country list + helpers, so the app never assumes a listing (or a
//   person) is in the Philippines. Countries are stored as ISO 3166-1
//   alpha-2 codes ("PH", "US", "JP"); the display name comes from the
//   browser's own Intl.DisplayNames, so no long name table has to be
//   maintained here.
//   formatLocation() builds the text shown on cards / details:
//     "Los Angeles, California, United States"
// CONNECTS TO :
//   components/CountrySelect.jsx, ListingCard.jsx, Details.jsx, Browse.jsx,
//   Profile.jsx, ListEquipment.jsx, Dashboard.jsx, MapPage.jsx, OwnerStore.jsx.
// ==================================================================

// Inhabited countries and territories people might list items from.
const ALL_CODES =
  "AD AE AF AG AI AL AM AO AR AS AT AU AW AX AZ BA BB BD BE BF BG BH BI BJ BL BM BN BO BQ BR BS BT BW BY BZ CA CC CD CF CG CH CI CK CL CM CN CO CR CU CV CW CX CY CZ DE DJ DK DM DO DZ EC EE EG EH ER ES ET FI FJ FK FM FO FR GA GB GD GE GF GG GH GI GL GM GN GP GQ GR GT GU GW GY HK HN HR HT HU ID IE IL IM IN IQ IR IS IT JE JM JO JP KE KG KH KI KM KN KP KR KW KY KZ LA LB LC LI LK LR LS LT LU LV LY MA MC MD ME MF MG MH MK ML MM MN MO MP MQ MR MS MT MU MV MW MX MY MZ NA NC NE NF NG NI NL NO NP NR NU NZ OM PA PE PF PG PH PK PL PM PN PR PS PT PW PY QA RE RO RS RU RW SA SB SC SD SE SG SH SI SJ SK SL SM SN SO SR SS ST SV SX SY SZ TC TD TG TH TJ TK TL TM TN TO TR TT TV TW TZ UA UG US UY UZ VA VC VE VG VI VN VU WF WS YE YT ZA ZM ZW".split(" ");

// Shown first in every country list (the app's main markets), then A-Z.
const PINNED = ["PH", "US", "JP"];

let displayNames = null;
function getDisplayNames() {
  if (displayNames === null) {
    try {
      displayNames = new Intl.DisplayNames(["en"], { type: "region" });
    } catch {
      displayNames = false; // very old browser: fall back to the raw code
    }
  }
  return displayNames;
}

/** "PH" -> "Philippines". Returns "" for empty/unknown input. */
export function countryName(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  const dn = getDisplayNames();
  if (!dn) return c;
  try {
    return dn.of(c) || c;
  } catch {
    return c;
  }
}

/** "PH" -> 🇵🇭 (regional-indicator letters; "" for bad input). */
export function countryFlag(code) {
  const c = String(code || "").trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c)) return "";
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}

/** True for a valid 2-letter code we know about. */
export function isCountryCode(code) {
  return ALL_CODES.includes(String(code || "").trim().toUpperCase());
}

/** [{ code, name }] — pinned markets first, then everything else A-Z. */
export const COUNTRY_OPTIONS = (() => {
  const rest = ALL_CODES.filter((c) => !PINNED.includes(c))
    .map((code) => ({ code, name: countryName(code) }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
  return [...PINNED.map((code) => ({ code, name: countryName(code) })), ...rest];
})();

// Ways people commonly write a country inside the free-text location.
const ALIASES = {
  US: ["usa", "u.s.a.", "u.s.", "us", "united states of america"],
  GB: ["uk", "u.k.", "great britain", "england", "scotland", "wales"],
  PH: ["ph", "pilipinas"],
  AE: ["uae"],
};

/**
 * "Los Angeles, California" + "US" -> "Los Angeles, California, United States".
 * Never adds the country twice if the text already ends with it, and never
 * invents one: with no country the text is returned as typed.
 */
export function formatLocation(location, code) {
  const loc = String(location || "").trim();
  const country = countryName(code);
  if (!country) return loc || "Location unknown";
  if (!loc) return country;
  const lower = loc.toLowerCase();
  const lastPart = lower.split(",").pop().trim();
  const names = [country.toLowerCase(), ...(ALIASES[String(code).toUpperCase()] || [])];
  if (names.includes(lastPart) || lower.endsWith(country.toLowerCase())) return loc;
  return `${loc}, ${country}`;
}
