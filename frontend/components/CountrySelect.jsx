// ==================================================================
// FILE TYPE : COMPONENT (shared, new)
// PURPOSE   :
//   One country dropdown used by Profile, the New-listing form, the
//   Edit-listing modal and Browse's country filter. Philippines, United
//   States and Japan are listed first, then every other country A-Z.
//   `value` is an ISO code ("PH") or "" for none.
// CONNECTS TO :
//   shared/countries.js
// ==================================================================
import React from "react";
import { COUNTRY_OPTIONS, countryFlag } from "../../shared/countries";

export default function CountrySelect({
  value,
  onChange,
  placeholder = "Select country",
  className = "",
  allowEmptyLabel,
  options,
  id,
}) {
  // `options` (optional) = a list of codes to show instead of all countries,
  // e.g. only the countries that currently have listings (Browse filter).
  const list = options
    ? COUNTRY_OPTIONS.filter((o) => options.includes(o.code))
    : COUNTRY_OPTIONS;
  return (
    <select
      id={id}
      value={value || ""}
      onChange={(e) => onChange(e.target.value)}
      className={className || "w-full rounded-xl border border-[#17231D]/12 px-4 py-2.5 text-[13.5px] outline-none bg-white"}
    >
      <option value="">{allowEmptyLabel || placeholder}</option>
      {list.map((o) => (
        <option key={o.code} value={o.code}>
          {countryFlag(o.code)} {o.name}
        </option>
      ))}
    </select>
  );
}
