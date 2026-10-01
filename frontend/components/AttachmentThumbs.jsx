// ==================================================================
// FILE TYPE : COMPONENT (shared, new)
// PURPOSE   :
//   Thumbnails for the photos attached to a report/support request.
//   The `report-attachments` bucket is private, so each thumbnail uses
//   a short-lived signed link fetched on demand (only the submitter and
//   admins can get one). Tapping a thumbnail opens it full-size.
// CONNECTS TO :
//   Used by pages/Help/Help.jsx (your own past requests) and
//   pages/Admin/Admin.jsx (the reports queue).
// ==================================================================
import React, { useEffect, useState } from "react";
import { getReportPhotoUrls } from "../../backend/supabase/storage";
import PhotoViewerModal from "./PhotoViewerModal";

// Small row of thumbnails for a past request's photos. Links are
// short-lived signed URLs (the bucket is private), fetched on demand.
export default function AttachmentThumbs({ paths }) {
  const [urls, setUrls] = useState([]);
  const [viewing, setViewing] = useState(null);
  useEffect(() => {
    let cancelled = false;
    if (!paths?.length) return undefined;
    getReportPhotoUrls(paths)
      .then((u) => { if (!cancelled) setUrls(u); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [paths]);
  if (!paths?.length) return null;
  return (
    <>
      <div className="flex gap-2 mt-2 flex-wrap">
        {urls.length === 0
          ? <span className="text-[11.5px] text-[#8A9089]">{paths.length} photo{paths.length === 1 ? "" : "s"} attached</span>
          : urls.map((u) => (
              <button key={u} type="button" onClick={() => setViewing(u)} className="w-12 h-12 rounded-lg overflow-hidden bg-[#17231D]/8">
                <img src={u} alt="Attachment" className="w-full h-full object-cover" />
              </button>
            ))}
      </div>
      {viewing && <PhotoViewerModal photoUrl={viewing} initial="" onClose={() => setViewing(null)} />}
    </>
  );
}

