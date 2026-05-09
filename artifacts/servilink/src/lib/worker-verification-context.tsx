import { createContext, useContext } from "react";

export interface WorkerVerificationState {
  status: string;
  notes: string;
  isVerified: boolean;
}

const WorkerVerificationContext = createContext<WorkerVerificationState>({
  status: "not_submitted",
  notes: "",
  isVerified: false,
});

export const WorkerVerificationProvider = WorkerVerificationContext.Provider;

export function useWorkerVerification(): WorkerVerificationState {
  return useContext(WorkerVerificationContext);
}
