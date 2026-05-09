import { memo } from "react";
import { Wrench, Scissors, Lightbulb, Hammer, Droplets, Paintbrush, Plug, Settings } from "lucide-react";

const GLOW = "drop-shadow(0 0 6px rgba(6,182,212,0.9)) drop-shadow(0 0 18px rgba(6,182,212,0.4)) drop-shadow(0 0 40px rgba(6,182,212,0.15))";

interface IconDef {
  Icon: React.ElementType;
  animClass: string;
  size: number;
  pos: React.CSSProperties;
}

const ICONS: IconDef[] = [
  { Icon: Wrench,     animClass: "neon-float-a", size: 54, pos: { top: "8%",    left: "4%",   transform: "rotate(-25deg)" } },
  { Icon: Scissors,   animClass: "neon-float-b", size: 42, pos: { top: "6%",    right: "6%",  transform: "rotate(20deg)"  } },
  { Icon: Lightbulb,  animClass: "neon-float-c", size: 50, pos: { top: "42%",   left: "3%",   transform: "rotate(-5deg)"  } },
  { Icon: Settings,   animClass: "neon-float-d", size: 46, pos: { bottom: "28%",left: "5%",   transform: "rotate(15deg)"  } },
  { Icon: Paintbrush, animClass: "neon-float-b", size: 44, pos: { top: "32%",   right: "4%",  transform: "rotate(-15deg)" } },
  { Icon: Droplets,   animClass: "neon-float-a", size: 52, pos: { bottom: "12%",right: "5%",  transform: "rotate(10deg)"  } },
  { Icon: Hammer,     animClass: "neon-float-c", size: 40, pos: { top: "68%",   right: "8%",  transform: "rotate(-20deg)" } },
  { Icon: Plug,       animClass: "neon-float-d", size: 38, pos: { top: "22%",   left: "8%",   transform: "rotate(5deg)"   } },
];

// Pre-compute star positions so they're stable across renders
const STARS = Array.from({ length: 18 }, (_, i) => ({
  key: i,
  size: i % 3 === 0 ? 2 : 1,
  top: `${(i * 37 + 5) % 95}%`,
  left: `${(i * 53 + 10) % 92}%`,
  delay: `${(i * 0.4).toFixed(1)}s`,
}));

export const NeonBackground = memo(function NeonBackground() {
  return (
    <>
      {/* Deep dark base */}
      <div
        className="fixed inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(ellipse at 40% 30%, #071020 0%, #040c18 50%, #020810 100%)",
          zIndex: 0,
        }}
      />

      {/* Animated smoke blobs */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden" style={{ zIndex: 0 }}>
        <div
          className="smoke-blob-a absolute"
          style={{
            top: "-10%", left: "-5%", width: 900, height: 700,
            borderRadius: "60% 40% 55% 45% / 50% 60% 40% 50%",
            background: "radial-gradient(ellipse at center, rgba(6,182,212,0.09) 0%, rgba(8,145,178,0.06) 40%, transparent 70%)",
            filter: "blur(80px)", animationDelay: "0s",
          }}
        />
        <div
          className="smoke-blob-b absolute"
          style={{
            top: "-5%", right: "-10%", width: 800, height: 650,
            borderRadius: "45% 55% 60% 40% / 55% 45% 55% 45%",
            background: "radial-gradient(ellipse at center, rgba(99,102,241,0.08) 0%, rgba(79,70,229,0.05) 45%, transparent 70%)",
            filter: "blur(90px)", animationDelay: "-20s",
          }}
        />
        <div
          className="smoke-blob-c absolute"
          style={{
            top: "30%", left: "20%", width: 700, height: 500,
            borderRadius: "50% 50% 45% 55% / 60% 40% 60% 40%",
            background: "radial-gradient(ellipse at center, rgba(30,58,138,0.12) 0%, rgba(29,78,216,0.07) 50%, transparent 70%)",
            filter: "blur(100px)", animationDelay: "-10s",
          }}
        />
        <div
          className="smoke-blob-d absolute"
          style={{
            bottom: "-15%", right: "5%", width: 750, height: 600,
            borderRadius: "55% 45% 40% 60% / 40% 60% 40% 60%",
            background: "radial-gradient(ellipse at center, rgba(20,184,166,0.07) 0%, rgba(6,182,212,0.04) 45%, transparent 70%)",
            filter: "blur(85px)", animationDelay: "-35s",
          }}
        />
      </div>

      {/* Stars — hidden on mobile via CSS to avoid extra DOM */}
      <div className="fixed inset-0 pointer-events-none hidden sm:block" style={{ zIndex: 0 }}>
        {STARS.map(({ key, size, top, left, delay }) => (
          <div
            key={key}
            className="absolute rounded-full neon-twinkle"
            style={{
              width: size, height: size, top, left,
              background: "rgba(6,182,212,0.5)",
              boxShadow: "0 0 4px rgba(6,182,212,0.7)",
              animationDelay: delay,
            }}
          />
        ))}
      </div>

      {/* Floating icons — hidden on mobile */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden hidden sm:block" style={{ zIndex: 1 }}>
        {ICONS.map(({ Icon, size, animClass, pos }, i) => (
          <div
            key={i}
            className={`absolute ${animClass}`}
            style={{ ...pos, animationDelay: `${(i * 0.9).toFixed(1)}s` }}
          >
            <Icon
              width={size} height={size}
              strokeWidth={1.2}
              style={{ color: "rgba(6,182,212,0.7)", filter: GLOW }}
            />
          </div>
        ))}
      </div>
    </>
  );
});
