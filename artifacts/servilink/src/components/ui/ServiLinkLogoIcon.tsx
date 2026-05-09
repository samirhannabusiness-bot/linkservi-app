interface Props {
  size?: number;
  className?: string;
}

export function LinkServiLogoIcon({ size = 32, className = "" }: Props) {
  const id = "sl-g";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 80 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <defs>
        <linearGradient id={id} x1="65" y1="8" x2="15" y2="92" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#38BDF8" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1B3B8A" />
        </linearGradient>
      </defs>

      {/* S-shaped path connecting all nodes */}
      <path
        d="M 18 88 C 8 72 52 68 44 50 C 36 32 72 28 62 12"
        stroke={`url(#${id})`}
        strokeWidth="5.5"
        strokeLinecap="round"
        fill="none"
      />

      {/* Bottom-left endpoint — large open circle */}
      <circle cx="18" cy="88" r="7.5" stroke={`url(#${id})`} strokeWidth="4.5" fill="none" />

      {/* Lower junction node */}
      <circle cx="34" cy="72" r="5" fill={`url(#${id})`} />

      {/* Middle S-crossing node (largest junction) */}
      <circle cx="44" cy="50" r="6" fill={`url(#${id})`} />

      {/* Upper junction node */}
      <circle cx="54" cy="28" r="5" fill={`url(#${id})`} />

      {/* Top-right endpoint — large open circle */}
      <circle cx="62" cy="12" r="7.5" stroke={`url(#${id})`} strokeWidth="4.5" fill="none" />
    </svg>
  );
}
