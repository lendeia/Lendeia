// ==================================================================
// FILE TYPE : COMPONENT (shared, new)
// PURPOSE   :
//   Full-screen photo viewer (click a small avatar, see it large) —
//   previously defined ONLY inside Profile.jsx for viewing your OWN
//   photo. Extracted here unchanged so OwnerStore.jsx can offer the
//   exact same viewer for someone ELSE's profile photo too.
// CONNECTS TO :
//   Used by Profile.jsx and Store/OwnerStore.jsx.
// ==================================================================
import React from "react";
import { X } from "lucide-react";

export default function PhotoViewerModal({ photoUrl, initial, onClose }) {
  return (
    <div
      className="fixed inset-0 bg-black/75 z-50 flex items-center justify-center px-4"
      onClick={onClose}
    >
      <button
        onClick={onClose}
        className="absolute top-5 right-5 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center text-white transition-colors"
      >
        <X size={20} />
      </button>
      <div
        className="max-w-[90vw] max-h-[80vh] rounded-2xl overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {photoUrl ? (
          <img src={photoUrl} className="max-w-[90vw] max-h-[80vh] object-contain" />
        ) : (
          <div className="w-64 h-64 bg-[#17231D]/8 flex items-center justify-center">
            <span className="font-serif text-[64px] text-[#6b6f66]">{initial}</span>
          </div>
        )}
      </div>
    </div>
  );
}
