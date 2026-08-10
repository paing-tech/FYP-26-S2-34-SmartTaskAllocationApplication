"use client";

import React from "react";
import { motion } from "framer-motion";

function initials(name) {
  return (name || "U")
    .trim()
    .split(/\s+/)
    .map((word) => word[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();
}

export function TestimonialsColumn({ className, testimonials, duration = 10 }) {
  return (
    <div className={className}>
      <motion.div
        animate={{ translateY: "-50%" }}
        transition={{
          duration: duration || 10,
          repeat: Infinity,
          ease: "linear",
          repeatType: "loop",
        }}
        className="flex flex-col gap-6 pb-6"
      >
        {[...new Array(2)].map((_, index) => (
          <React.Fragment key={index}>
            {testimonials.map(({ text, image, name, role }, i) => (
              <div
                className="w-full max-w-xs rounded-3xl border border-[#0D1E4C]/10 bg-white p-8 shadow-[0_18px_50px_rgba(13,30,76,0.08)]"
                key={i}
              >
                <div className="text-[#0D1E4C]/80">{text}</div>
                <div className="mt-5 flex items-center gap-3">
                  {image ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      width={40}
                      height={40}
                      src={image}
                      alt={name}
                      className="h-10 w-10 rounded-full object-cover"
                      loading="lazy"
                    />
                  ) : (
                    <span className="flex h-10 w-10 items-center justify-center rounded-full bg-[#0D1E4C] text-xs font-bold text-white">
                      {initials(name)}
                    </span>
                  )}
                  <div className="flex flex-col">
                    <div className="font-bold leading-5 tracking-tight text-[#0D1E4C]">{name}</div>
                    <div className="text-sm leading-5 tracking-tight text-[#0D1E4C]/60">{role}</div>
                  </div>
                </div>
              </div>
            ))}
          </React.Fragment>
        ))}
      </motion.div>
    </div>
  );
}

export default TestimonialsColumn;
