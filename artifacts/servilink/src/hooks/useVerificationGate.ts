/**
 * useVerificationGate
 *
 * Wrap any "critical action" (book, chat, buy) so that:
 *  - If the client is approved or pending → action runs immediately.
 *  - If not_submitted or rejected → show ClientKYCModal, then run action after submission.
 *
 * Usage:
 *   const { gateOpen, gateProps, runWithGate } = useVerificationGate();
 *   ...
 *   runWithGate(() => doBooking());
 *   ...
 *   {gateOpen && <ClientKYCModal {...gateProps} />}
 */

import { useState, useCallback } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/lib/auth-context";

type VerifStatus = "not_submitted" | "pending" | "approved" | "rejected";

interface VerifStatusResponse {
  status: VerifStatus;
  rejectionNote?: string | null;
}

export function useVerificationGate() {
  const { user, token } = useAuth();
  const isClient = user?.role === "client";

  const { data: verifData } = useQuery<VerifStatusResponse>({
    // Include token in queryKey so the query re-runs after login/logout.
    queryKey: ["my-verification-status", user?.id, !!token],
    queryFn: async () => {
      // NEVER read from localStorage — sl_token is NOT stored there after Phase 1.
      // Cookie-based sessions: cookie is sent automatically (credentials: "include").
      // Fresh JWT sessions (right after login): send the in-memory Bearer token.
      const headers: Record<string, string> = {};
      if (token && token !== "__cookie__") {
        headers.Authorization = `Bearer ${token}`;
      }
      const res = await fetch("/api/me/verification/status", {
        credentials: "include",
        headers,
      });
      if (!res.ok) {
        // If the endpoint fails (non-client role, network, etc.) treat as approved
        // so clients are never incorrectly blocked — backend validates on each action.
        return { status: "approved" as VerifStatus };
      }
      return res.json();
    },
    enabled: isClient && !!token,
    staleTime: 1000 * 30,   // 30s
    gcTime: 1000 * 60 * 2,
  });

  const [gateOpen, setGateOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<(() => void) | null>(null);

  const runWithGate = useCallback(
    (action: () => void) => {
      if (!isClient) {
        action();
        return;
      }
      const status = verifData?.status ?? "not_submitted";
      if (status === "approved" || status === "pending") {
        action();
      } else {
        // not_submitted or rejected → show KYC modal
        setPendingAction(() => action);
        setGateOpen(true);
      }
    },
    [isClient, verifData]
  );

  const handleGateSuccess = useCallback(() => {
    setGateOpen(false);
    pendingAction?.();
    setPendingAction(null);
  }, [pendingAction]);

  const handleGateDismiss = useCallback(() => {
    setGateOpen(false);
    setPendingAction(null);
  }, []);

  return {
    gateOpen,
    runWithGate,
    gateProps: {
      onSuccess: handleGateSuccess,
      onDismiss: handleGateDismiss,
      rejectionNote: verifData?.rejectionNote,
      isRejected: verifData?.status === "rejected",
    },
  };
}
