// The one place an actual basketball glyph belongs: the brand mark itself.
// Lucide doesn't ship a basketball icon, so this is a small hand-drawn
// line mark (circle + seam curves) reused everywhere the app's logo appears.
export default function BrandMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" className={className} aria-hidden="true">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="1.7" />
      <path
        d="M3 12h18M12 3a14 14 0 0 1 0 18M12 3a14 14 0 0 0 0 18"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}
