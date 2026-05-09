import { type ReactNode } from "react";

interface FadeInProps {
  children: ReactNode;
  delay?: number;
  className?: string;
}

export function FadeIn({ children, delay = 0, className }: FadeInProps) {
  return (
    <div
      className={className}
      style={{
        animation: `fadeInUp 0.35s ease-out ${delay}s both`,
      }}
    >
      {children}
    </div>
  );
}
