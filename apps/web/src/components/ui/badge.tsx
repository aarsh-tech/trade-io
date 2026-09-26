import * as React from "react";
import { cn } from "@/lib/utils";
import { cva, type VariantProps } from "class-variance-authority";

const badgeVariants = cva(
  "inline-flex items-center gap-1.5 rounded-sm px-2 py-0.5 text-[11px] font-semibold tracking-wide transition-colors",
  {
    variants: {
      variant: {
        default:    "bg-brand-subtle text-accent-foreground border border-primary/25",
        secondary:  "bg-[hsl(var(--secondary))] text-[hsl(var(--secondary-foreground))] border border-[hsl(var(--border))]",
        outline:    "text-[hsl(var(--foreground))] border border-[hsl(var(--border))]",
        running:    "badge-running",
        stopped:    "badge-stopped",
        error:      "badge-error",
        success:    "bg-profit-subtle text-profit border border-profit/25",
        warning:    "bg-warn-subtle text-warn border border-warn/25",
        destructive:"bg-loss-subtle text-loss border border-loss/25",
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
