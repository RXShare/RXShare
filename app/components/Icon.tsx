import { cn } from "~/lib/utils";

export function Icon({ name, className }: { name: string; className?: string }) {
  return <span className={cn("material-symbols-outlined leading-none", className)}>{name}</span>;
}
