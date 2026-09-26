// ==================================================================
// FILE TYPE : LAYOUT
// PURPOSE   :
//   Thin wrapper around MainLayout that centers content in a max-width column.
//   Currently unused by App.jsx (pages render directly inside MainLayout) —
//   kept as a seam for giving Dashboard/ListEquipment/Profile their own chrome
//   (e.g. a sidebar) later without touching those page components.
// ==================================================================
import React from "react";
import MainLayout from "./MainLayout";

/**
 * Layout for authenticated, dashboard-style pages (Dashboard, ListEquipment, Profile).
 * Currently just delegates to MainLayout, but gives us a seam to add
 * an owner/renter sidebar, breadcrumbs, etc. later without touching pages.
 */
export default function DashboardLayout({ page, setPage, children }) {
  return (
    <MainLayout page={page} setPage={setPage}>
      <div className="max-w-6xl mx-auto">{children}</div>
    </MainLayout>
  );
}
