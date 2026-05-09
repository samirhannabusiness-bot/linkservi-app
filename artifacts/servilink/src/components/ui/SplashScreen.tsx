import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";

const ZAP_PATH = "M13 2L3 14h9l-1 8 10-12h-9l1-8z";

interface SplashScreenProps {
  onComplete: () => void;
}

export function SplashScreen({ onComplete }: SplashScreenProps) {
  const [visible, setVisible] = useState(true);
  const [phase, setPhase] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setPhase(1), 600);
    const t2 = setTimeout(() => setPhase(2), 900);
    const t3 = setTimeout(() => setVisible(false), 1350);
    const t4 = setTimeout(onComplete, 1750);
    return () => { [t1, t2, t3, t4].forEach(clearTimeout); };
  }, [onComplete]);

  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          key="splash"
          className="fixed inset-0 flex items-center justify-center overflow-hidden select-none"
          style={{ zIndex: 9999, background: "#040c1a" }}
          initial={{ opacity: 1 }}
          exit={{ opacity: 0, scale: 1.08 }}
          transition={{ duration: 0.42, ease: [0.4, 0, 0.2, 1] }}
        >
          {/* Ambient glow */}
          <motion.div
            className="absolute pointer-events-none rounded-full"
            style={{
              width: 520, height: 520,
              background: "radial-gradient(circle, rgba(6,182,212,0.13) 0%, rgba(59,130,246,0.06) 45%, transparent 72%)",
            }}
            initial={{ opacity: 0, scale: 0.6 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 1.0, ease: "easeOut" }}
          />

          {/* Ring ripple */}
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{
              width: 84, height: 84,
              border: "1.5px solid rgba(6,182,212,0.8)",
              boxShadow: "0 0 12px rgba(6,182,212,0.35)",
            }}
            initial={{ scale: 0.7, opacity: 0.9 }}
            animate={{ scale: 4.2, opacity: 0 }}
            transition={{ duration: 0.7, delay: 0.04, ease: [0, 0, 0.2, 1] }}
          />
          <motion.div
            className="absolute rounded-full pointer-events-none"
            style={{ width: 84, height: 84, border: "1px solid rgba(59,130,246,0.45)" }}
            initial={{ scale: 0.7, opacity: 0.7 }}
            animate={{ scale: 5.5, opacity: 0 }}
            transition={{ duration: 1.0, delay: 0.2, ease: [0, 0, 0.2, 1] }}
          />

          {/* Main content */}
          <div className="relative flex flex-row items-center gap-6">
            <div className="relative w-20 h-20">
              {/* Box */}
              <motion.div
                className="absolute inset-0 rounded-3xl"
                style={{
                  background: "linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)",
                  boxShadow: "0 0 32px rgba(6,182,212,0.70), 0 0 80px rgba(6,182,212,0.22), 0 8px 32px rgba(0,0,0,0.70)",
                }}
                initial={{ opacity: 0, scale: 0.72 }}
                animate={{ opacity: phase >= 2 ? 1 : 0, scale: phase >= 2 ? 1 : 0.72 }}
                transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
              />

              {/* Pulsing ring */}
              <motion.div
                className="absolute pointer-events-none"
                style={{ inset: -7, border: "1.5px solid rgba(6,182,212,0.5)", borderRadius: 28 }}
                initial={{ opacity: 0, scale: 0.88 }}
                animate={{
                  opacity: phase >= 2 ? [0, 0.9, 0.4] : 0,
                  scale: phase >= 2 ? [0.88, 1.06, 1] : 0.88,
                }}
                transition={{ duration: 0.7, ease: "easeOut" }}
              />

              {/* Bolt SVG */}
              <div className="absolute inset-0 flex items-center justify-center z-10">
                <svg viewBox="0 0 24 24" width="46" height="46" fill="none"
                  strokeLinecap="round" strokeLinejoin="round">
                  <motion.path
                    d={ZAP_PATH}
                    stroke="rgba(6,182,212,1)"
                    strokeWidth={1.7}
                    fill="none"
                    filter="url(#glow)"
                    initial={{ pathLength: 0, opacity: 1 }}
                    animate={{ pathLength: 1, opacity: phase >= 1 ? 0 : 1 }}
                    transition={{
                      pathLength: { duration: 0.6, ease: [0.4, 0, 0.2, 1] },
                      opacity: { duration: 0.15, delay: phase >= 1 ? 0 : 999 },
                    }}
                  />
                  <motion.path
                    d={ZAP_PATH}
                    fill="white"
                    stroke="none"
                    initial={{ opacity: 0 }}
                    animate={{ opacity: phase >= 1 ? 1 : 0 }}
                    transition={{ duration: 0.2, ease: "easeIn" }}
                  />
                  <defs>
                    <filter id="glow" x="-30%" y="-30%" width="160%" height="160%">
                      <feGaussianBlur stdDeviation="1.5" result="blur" />
                      <feMerge>
                        <feMergeNode in="blur" />
                        <feMergeNode in="SourceGraphic" />
                      </feMerge>
                    </filter>
                  </defs>
                </svg>
              </div>

              {/* Sheen */}
              <motion.div
                className="absolute inset-0 rounded-3xl overflow-hidden pointer-events-none z-20"
                style={{ opacity: phase >= 2 ? 1 : 0 }}
              >
                <motion.div
                  className="absolute inset-0"
                  style={{
                    background: "linear-gradient(108deg, transparent 18%, rgba(255,255,255,0.26) 50%, transparent 82%)",
                  }}
                  initial={{ x: "-140%" }}
                  animate={{ x: phase >= 2 ? "230%" : "-140%" }}
                  transition={{ duration: 0.38, delay: 0.06, ease: "easeInOut" }}
                />
              </motion.div>
            </div>

            {/* App name */}
            <div className="flex flex-col">
              <motion.span
                className="text-4xl font-bold tracking-tight leading-none"
                style={{
                  background: "linear-gradient(135deg, #ffffff 38%, rgba(6,182,212,0.88) 100%)",
                  WebkitBackgroundClip: "text",
                  WebkitTextFillColor: "transparent",
                  backgroundClip: "text",
                  filter: "drop-shadow(0 0 16px rgba(6,182,212,0.50))",
                }}
                initial={{ opacity: 0, x: -18 }}
                animate={{ opacity: phase >= 2 ? 1 : 0, x: phase >= 2 ? 0 : -18 }}
                transition={{ duration: 0.38, ease: [0.22, 1, 0.36, 1] }}
              >
                LinkServi
              </motion.span>
              <motion.span
                className="text-xs tracking-[0.22em] uppercase mt-1.5"
                style={{ color: "rgba(6,182,212,0.62)" }}
                initial={{ opacity: 0, x: -10 }}
                animate={{ opacity: phase >= 2 ? 0.9 : 0, x: phase >= 2 ? 0 : -10 }}
                transition={{ duration: 0.32, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
              >
                Tu servicio, a un toque
              </motion.span>
            </div>
          </div>

          {/* Bottom label */}
          <motion.p
            className="absolute bottom-10 text-xs tracking-widest"
            style={{ color: "rgba(255,255,255,0.15)" }}
            initial={{ opacity: 0 }}
            animate={{ opacity: phase >= 2 ? 1 : 0 }}
            transition={{ delay: 0.15, duration: 0.4 }}
          >
            Venezuela · 2025
          </motion.p>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
