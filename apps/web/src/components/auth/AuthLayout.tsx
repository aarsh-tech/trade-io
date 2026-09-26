"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";
import { ThemeToggle } from "@/components/theme-toggle";

interface AuthLayoutProps {
  children: ReactNode;
  title?: string;
  subtitle?: string | ReactNode;
  footerLink?: {
    text: string;
    actionText: string;
    href: string;
  };
  showLeftPanel?: boolean;
}

export function AuthLayout({
  children,
  title,
  subtitle,
  footerLink,
}: AuthLayoutProps) {
  return (
    <div className="relative min-h-screen flex flex-col items-center justify-center bg-background text-foreground font-sans py-12 px-4 selection:bg-primary selection:text-primary-foreground">
      <div className="absolute top-3 right-3 sm:top-4 sm:right-4">
        <ThemeToggle />
      </div>
      {/* Centered White Card (Kite Dimensions & Clean Minimalist Box) */}
      <div className="w-full max-w-[390px] bg-card border border-input rounded-lg p-8 sm:p-10 pt-10 pb-9">
        {/* Top Logo - Tradeio.site Blue Brand */}
        <div className="flex justify-center mb-6">
          <Link href="/" className="inline-flex items-center justify-center group">
            <div className="h-12 w-12 rounded-lg bg-primary flex items-center justify-center group-hover:bg-brand-hover transition-colors">
              <Zap className="h-6 w-6 text-primary-foreground" strokeWidth={2.5} />
            </div>
          </Link>
        </div>

        {/* Heading */}
        {title && (
          <div className="text-center mb-7">
            <h1 className="text-[22px] font-normal text-foreground tracking-normal">
              {title}
            </h1>
            {subtitle && (
              <div className="text-xs text-muted-foreground mt-1.5 leading-relaxed">
                {subtitle}
              </div>
            )}
          </div>
        )}

        {/* Card Content (Form) */}
        {children}
      </div>

      {/* Outside Card Footer Area */}
      <div className="w-full max-w-[480px] mt-8 text-center space-y-4">


        {/* Brand Text */}
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-muted-foreground tracking-widest uppercase">
          <Zap className="h-3.5 w-3.5 text-accent-foreground fill-primary" />
          <span>Tradeio.site</span>
        </div>

        {/* Dynamic Context Link */}
        {footerLink && (
          <div className="text-xs text-muted-foreground">
            {footerLink.text}{" "}
            <Link
              href={footerLink.href}
              className="text-foreground/80 hover:text-accent-foreground transition-colors font-normal hover:underline"
            >
              {footerLink.actionText}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
