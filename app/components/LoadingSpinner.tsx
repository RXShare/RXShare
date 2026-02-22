export function LoadingSpinner({ size = "md" }: { size?: "sm" | "md" | "lg" }) {
  const s = size === "sm" ? "h-4 w-4" : size === "lg" ? "h-8 w-8" : "h-6 w-6";
  return (
    <div className="flex items-center justify-center">
      <div className={`${s} border-2 border-primary/20 border-t-primary rounded-full animate-spin`} />
    </div>
  );
}

export function PageLoader() {
  return (
    <div className="flex items-center justify-center min-h-[60vh]">
      <div className="flex flex-col items-center gap-3 animate-in fade-in duration-300">
        <LoadingSpinner size="lg" />
        <p className="text-sm text-gray-500">Loading...</p>
      </div>
    </div>
  );
}
