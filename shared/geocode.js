// ==================================================================
// FILE TYPE : SHARED UTILITY
// PURPOSE   :
//   Coordinates -> readable place, moved out of components/LocationPicker.jsx
//   so state stores can use it too (LocationPicker still re-exports
//   `reverseGeocode`, so existing imports keep working).
//   - reverseGeocode(lat, lng)      -> "Los Angeles" (short text, as before)
//   - reverseGeocodeFull(lat, lng)  -> { text, city, region, countryCode }
//     where text is "Los Angeles, California" (country kept separate; it is
//     saved in its own column and added back by formatLocation()).
//   Uses BigDataCloud's free client-side endpoint (no API key).
// CONNECTS TO :
//   LocationPicker.jsx, ListEquipment.jsx, Profile.jsx, state/location/locationStore.jsx
// ==================================================================

async function fetchPlace(lat, lng) {
  const res = await fetch(
    `https://api.bigdatacloud.net/data/reverse-geocode-client?latitude=${lat}&longitude=${lng}&localityLanguage=en`
  );
  if (!res.ok) throw new Error("reverse geocode failed");
  return res.json();
}

export async function reverseGeocode(lat, lng) {
  try {
    const data = await fetchPlace(lat, lng);
    const readable =
      data.locality ||
      data.city ||
      data.principalSubdivision ||
      [data.locality, data.principalSubdivision].filter(Boolean).join(", ");
    return readable || `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  } catch {
    return `${lat.toFixed(4)}, ${lng.toFixed(4)}`;
  }
}

export async function reverseGeocodeFull(lat, lng) {
  try {
    const data = await fetchPlace(lat, lng);
    const city = data.locality || data.city || "";
    const region = data.principalSubdivision || "";
    // "Manila, Metro Manila" is fine, but avoid "Singapore, Singapore".
    const parts = [city, region].filter(Boolean);
    const text = parts.filter((p, i) => parts.findIndex((q) => q.toLowerCase() === p.toLowerCase()) === i).join(", ");
    const code = String(data.countryCode || "").toUpperCase();
    return {
      text: text || `${lat.toFixed(4)}, ${lng.toFixed(4)}`,
      city,
      region,
      countryCode: /^[A-Z]{2}$/.test(code) ? code : null,
    };
  } catch {
    return { text: `${lat.toFixed(4)}, ${lng.toFixed(4)}`, city: "", region: "", countryCode: null };
  }
}
