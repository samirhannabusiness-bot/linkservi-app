import { useAuth } from "@/lib/auth-context";
import { apiFetch, getAuthHeader } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export function useWorkerStatus() {
  const { token } = useAuth();
  return useQuery({
    queryKey: ["profile", "worker-status"],
    queryFn: () => apiFetch("/api/profile/worker-status", { headers: getAuthHeader() }),
    enabled: !!token,
    staleTime: 30_000,
  });
}
