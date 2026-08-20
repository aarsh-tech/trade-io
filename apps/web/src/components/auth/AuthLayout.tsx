"use client";

import React, { ReactNode } from "react";
import Link from "next/link";
import { Zap } from "lucide-react";

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
    <div className="min-h-screen flex flex-col items-center justify-center bg-[#fbfbfb] text-[#444444] font-sans py-12 px-4 selection:bg-blue-600 selection:text-white">
      {/* Centered White Card (Kite Dimensions & Clean Minimalist Box) */}
      <div className="w-full max-w-[390px] bg-white border border-[#e8e8e8] rounded-[4px] shadow-[0_2px_8px_rgba(0,0,0,0.05)] p-8 sm:p-10 pt-10 pb-9">
        {/* Top Logo - TradeIO Blue Brand */}
        <div className="flex justify-center mb-6">
          <Link href="/" className="inline-flex items-center justify-center group">
            <div className="h-12 w-12 rounded-xl bg-blue-600 flex items-center justify-center shadow-xs group-hover:bg-blue-700 transition-colors">
              <Zap className="h-6 w-6 text-white" strokeWidth={2.5} />
            </div>
          </Link>
        </div>

        {/* Heading */}
        {title && (
          <div className="text-center mb-7">
            <h1 className="text-[22px] font-normal text-[#424242] tracking-normal">
              {title}
            </h1>
            {subtitle && (
              <div className="text-xs text-[#777777] mt-1.5 leading-relaxed">
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
        <div className="flex items-center justify-center gap-1.5 text-xs font-semibold text-[#888888] tracking-widest uppercase">
          <Zap className="h-3.5 w-3.5 text-blue-600 fill-blue-600" />
          <span>TradeIO</span>
        </div>

        {/* Dynamic Context Link */}
        {footerLink && (
          <div className="text-xs text-[#777777]">
            {footerLink.text}{" "}
            <Link
              href={footerLink.href}
              className="text-[#555555] hover:text-blue-600 transition-colors font-normal hover:underline"
            >
              {footerLink.actionText}
            </Link>
          </div>
        )}
      </div>
    </div>
  );
}
