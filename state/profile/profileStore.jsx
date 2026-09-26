// ==================================================================
// FILE TYPE : STATE — React Context store
// PURPOSE   :
//   Fetches the extended profile (backend/profile/getProfile.js) whenever the
//   authStore's `account` changes; clears it on logout.
// CONNECTS TO :
//   Depends on state/auth/authStore.jsx's useAuth(). Not yet consumed by any page.
// ==================================================================
import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { useAuth } from "../auth/authStore";
import { getProfile } from "../../backend/profile/getProfile";
import { updateProfile as updateProfileBackend } from "../../backend/profile/updateProfile";

const initialProfileState = { profile: null, loading: false, error: null, updateProfile: async () => {} };

export const ProfileContext = createContext(initialProfileState);

export function ProfileProvider({ children }) {
  const { account } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (!account) {
      setProfile(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    getProfile(account.id ?? account.email)
      .then((data) => { if (!cancelled) setProfile(data); })
      .catch((err) => { if (!cancelled) setError(err.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [account]);

  const updateProfile = useCallback(async (patch) => {
    const updated = await updateProfileBackend(account?.id ?? account?.email, patch);
    setProfile(updated);
    return updated;
  }, [account]);

  return (
    <ProfileContext.Provider value={{ profile, loading, error, updateProfile }}>
      {children}
    </ProfileContext.Provider>
  );
}

export function useProfile() {
  return useContext(ProfileContext);
}
