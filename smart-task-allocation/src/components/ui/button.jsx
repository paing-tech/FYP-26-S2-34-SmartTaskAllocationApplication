import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cn } from "@/lib/utils";

const variants = {
  default: "bg-[#0a2a66] text-white hover:bg-[#07183b]",
  destructive: "bg-red-600 text-white hover:bg-red-700",
  outline: "border border-white/45 bg-white/25 text-white hover:bg-white/35",
  secondary: "bg-white/15 text-white hover:bg-white/25",
  ghost: "text-white hover:bg-white/15",
  link: "text-white underline-offset-4 hover:underline",
};

const sizes = {
  default: "h-10 px-4 py-2",
  sm: "h-9 rounded-md px-3",
  lg: "h-11 rounded-md px-8",
  icon: "h-10 w-10",
};

const Button = React.forwardRef(
  ({ className, variant = "default", size = "default", asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center whitespace-nowrap rounded-md text-sm font-bold transition-colors focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50",
          variants[variant] ?? variants.default,
          sizes[size] ?? sizes.default,
          className,
        )}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button };
