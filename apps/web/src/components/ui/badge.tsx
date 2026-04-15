import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold transition-colors",
  {
    variants: {
      variant: {
        default:    "bg-[hsl(var(--primary)/0.15)] text-[hsl(var(--primary))] border border-[hsl(var(--primary)/0.3)]",
        secondary:  "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-[hsl(var(--border))]",
        running:    "badge-running",
        stopped:    "badge-stopped",
        error:      "badge-error",
        success:    "bg-[hsl(var(--green)/0.15)] text-[hsl(var(--green))] border border-[hsl(var(--green)/0.3)]",
        warning:    "bg-[hsl(var(--gold)/0.15)] text-[hsl(var(--gold))] border border-[hsl(var(--gold)/0.3)]",
        destructive:"bg-[hsl(var(--red)/0.15)] text-[hsl(var(--red))] border border-[hsl(var(--red)/0.3)]",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {
  dot?: boolean;
}

function Badge({ className, variant, dot, children, ...props }: BadgeProps) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props}>
      {dot && (
        <span
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            variant === "running" ? "bg-[hsl(var(--green))] animate-pulse" : "bg-current"
          )}
        />
      )}
      {children}
    </div>
  );
}

export { Badge, badgeVariants };
