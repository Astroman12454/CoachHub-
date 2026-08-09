import { cn } from "@/lib/utils";

interface CircularTimerProps {
  /** Fraction of time remaining, 0 (done) to 1 (just started). */
  progress: number;
  /** Final countdown — ring switches to the urgent color and pulses. */
  urgent?: boolean;
  size?: number;
  strokeWidth?: number;
  className?: string;
  children: React.ReactNode;
}

// A ring around the countdown digits, not instead of them — the number is
// still what a coach reads from across the gym, the ring is what catches a
// glance from anyone not looking straight at it. Ticks down in one-second
// steps via a CSS transition rather than per-frame JS, so it costs nothing
// extra over the countdown state TrainingMode already tracks.
export default function CircularTimer({
  progress,
  urgent = false,
  size = 240,
  strokeWidth = 6,
  className,
  children,
}: CircularTimerProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const clamped = Math.max(0, Math.min(1, progress));
  const offset = circumference * (1 - clamped);

  return (
    <div className={cn("relative inline-flex items-center justify-center", className)} style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden="true">
        <circle cx={size / 2} cy={size / 2} r={radius} fill="none" stroke="currentColor" strokeWidth={strokeWidth} className="text-white/10" />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="currentColor"
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          className={cn(
            "transition-[stroke-dashoffset,color] duration-1000 ease-linear",
            urgent ? "text-destructive animate-pulse" : "text-basketball-orange"
          )}
        />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">{children}</div>
    </div>
  );
}
