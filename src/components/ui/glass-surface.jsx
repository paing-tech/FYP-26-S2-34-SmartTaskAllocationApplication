import { cn } from "@/lib/utils";

/**
 * Frosted-glass surface panel. Translucent white with backdrop blur, a soft
 * border and shadow — matches the side-menu glass aesthetic. Drop content
 * inside and it sits on the glass.
 */
export default function GlassSurface({ className, children, ...props }) {
  return (
    <div
      className={cn(
        "rounded-[34px] border border-white/60 bg-white/10 shadow-[0_20px_60px_rgba(13,30,76,0.15)] backdrop-blur-xs",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
}
