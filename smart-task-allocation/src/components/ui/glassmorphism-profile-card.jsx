"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import Image from "next/image";
import { Copy, Plus, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { cn } from "@/lib/utils";

function initialsFromName(name) {
  return (name || "Employee")
    .split(" ")
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export default function GlassmorphismProfileCard({
  name = "Employee",
  role = "Employee",
  email = "employee@workflow.co",
  avatarSrc,
  departmentName = "No department",
  statusText = "Available for work",
  statusColor = "bg-lime-500",
  glowText = "Currently High on Creativity",
  glowClassName = "bg-lime-400 shadow-[0_28px_60px_-18px_rgba(132,204,22,0.75)]",
  children,
  className,
}) {
  const [copied, setCopied] = useState(false);
  const initials = initialsFromName(name) || "E";

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(email);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={cn("relative mx-auto w-full max-w-[220px] pb-7", className)}
    >
      <div
        className={cn(
          "pointer-events-none absolute inset-x-3 bottom-0 h-14 rounded-[20px]",
          glowClassName
        )}
      />

      <div
        className={cn(
          "absolute inset-x-4 bottom-0 z-0 flex h-10 items-center justify-center gap-1.5 rounded-b-[20px] px-2 text-[11px] font-black text-black",
          glowClassName
        )}
      >
        <Zap className="h-3.5 w-3.5 shrink-0" />
        <span className="truncate">{glowText}</span>
      </div>

      <Card className="relative z-10 overflow-hidden rounded-xl border border-black/20 bg-white/20 backdrop-blur-md text-black shadow-[0_24px_80px_rgba(7,24,59,0.12)]">
        <CardContent className="p-4">
          <div className="mb-4 pt-4 flex items-center justify-between gap-2 text-[11px] font-bold text-black/45">
            <div className="flex min-w-0 items-center gap-2">
              <span className={cn("h-2 w-2 shrink-0 rounded-full", statusColor)} />
              <span>{statusText}</span>
            </div>
            <span className="max-w-[45%] truncate text-right">{departmentName}</span>
          </div>

          <div className="flex flex-col items-center">
            <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[18px] bg-[#061a40] text-3xl font-black text-white">
              {avatarSrc ? (
                <Image
                  src={avatarSrc}
                  alt={`${name} avatar`}
                  fill
                  sizes="96px"
                  className="object-cover"
                />
              ) : (
                initials
              )}
            </div>

            <h3 className="mt-4 max-w-full truncate text-center text-xl font-black leading-tight text-black">
              {name}
            </h3>
            <p className="mt-1 text-center text-xs font-bold text-black/40">{role}</p>
          </div>

          {children ? (
            <div className="mt-4">{children}</div>
          ) : (
            <div className="mt-5 grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10 rounded-[14px] border-black/10 bg-white/50 text-xs font-black text-black hover:bg-white/70"
              >
                <Plus className="h-4 w-4" />
                Hire Me
              </Button>
              <Button
                type="button"
                variant="outline"
                onClick={handleCopy}
                className="h-10 rounded-[14px] border-black/10 bg-white/50 text-xs font-black text-black hover:bg-white/70"
              >
                <Copy className="h-4 w-4" />
                {copied ? "Copied" : "Copy Email"}
              </Button>
            </div>
          )}
        </CardContent>
      </Card>
    </motion.div>
  );
}
