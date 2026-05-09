import { useIsFetching } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

export function GlobalLoadingBar() {
  const isFetching = useIsFetching();
  const [visible, setVisible] = useState(false);
  const [width, setWidth] = useState(0);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (isFetching > 0) {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
      setVisible(true);
      setWidth(0);
      timerRef.current = setTimeout(() => setWidth(72), 30);
    } else {
      setWidth(100);
      hideTimerRef.current = setTimeout(() => {
        setVisible(false);
        setWidth(0);
      }, 400);
    }

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [isFetching]);

  if (!visible) return null;

  return (
    <div
      className="fixed top-0 left-0 right-0 z-[9999] h-[2.5px] pointer-events-none"
      style={{ background: "rgba(6,182,212,0.12)" }}
    >
      <div
        style={{
          height: "100%",
          width: `${width}%`,
          background: "linear-gradient(90deg, #06b6d4 0%, #3b82f6 60%, #06b6d4 100%)",
          boxShadow: "0 0 8px rgba(6,182,212,0.8)",
          transition: width === 100
            ? "width 0.3s ease-out"
            : width === 0
            ? "none"
            : "width 2.5s cubic-bezier(0.1, 0.5, 0.3, 1)",
          borderRadius: "0 2px 2px 0",
        }}
      />
    </div>
  );
}
