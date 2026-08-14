import { Skeleton } from "@/components/ui/skeleton";

// Loading placeholder shared by PlayEditor and ExerciseDiagramEditor —
// mirrors their actual shell (name/options header, tool palette, centered
// court canvas) instead of a bare spinner or loading text, matching the
// Skeleton vocabulary every other page in the app uses while its data loads.
export default function DiagramEditorSkeleton() {
  return (
    <div className="flex flex-col h-full bg-background" aria-hidden="true">
      <header className="bg-card border-b border-border px-4 py-3 flex flex-col gap-2">
        <div className="flex items-center gap-3 flex-wrap">
          <Skeleton className="h-9 w-[220px]" />
          <Skeleton className="h-9 w-36" />
          <Skeleton className="h-9 w-32" />
          <div className="flex-1" />
          <Skeleton className="h-9 w-24" />
          <Skeleton className="h-9 w-28" />
        </div>
        <Skeleton className="h-12 w-full" />
      </header>

      <div className="bg-card border-b border-border px-4 py-2 flex items-center gap-2 overflow-x-auto">
        {Array.from({ length: 9 }).map((_, i) => (
          <Skeleton key={i} className="flex-shrink-0 w-10 h-10 rounded-md" />
        ))}
      </div>

      <main className="flex-1 overflow-auto p-4 flex items-start justify-center bg-muted/30">
        <Skeleton className="w-full max-w-2xl aspect-[10/9]" />
      </main>
    </div>
  );
}
