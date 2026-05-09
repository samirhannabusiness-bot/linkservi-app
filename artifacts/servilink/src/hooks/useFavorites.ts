import { useState, useEffect, useCallback } from "react";
import { getAuthHeader } from "@/lib/api";

export interface FavoriteWorker {
  id: number;
  userId: number;
  name: string;
  avatarUrl?: string | null;
  categoryName?: string | null;
  rating?: number | null;
  reviewCount?: number | null;
  completedJobs?: number | null;
  isAvailable?: boolean;
  isVerified?: boolean;
  isPremium?: boolean;
  servicePrice?: number | null;
  state?: string | null;
  city?: string | null;
  favoritedAt?: string;
}

export function useFavorites() {
  const [favorites, setFavorites] = useState<FavoriteWorker[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const load = useCallback(() => {
    setLoading(true);
    fetch("/api/favorites", { headers: getAuthHeader() })
      .then(r => r.ok ? r.json() : [])
      .then(setFavorites)
      .catch(() => setError("No se pudo cargar favoritos"))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { load(); }, [load]);

  return { favorites, loading, error, refetch: load };
}
