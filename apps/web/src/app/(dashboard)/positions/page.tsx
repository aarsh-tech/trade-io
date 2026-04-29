"use client";

import { Activity } from "lucide-react";

export default function PositionsPage() {
  return (
    <div className="flex flex-col items-center justify-center h-[calc(100vh-60px)] bg-[#fbfcfd]">
      <div className="w-32 h-32 opacity-10 mb-4">
        <Activity className="w-full h-full text-slate-400" />
      </div>
      <p className="text-[14px] text-slate-400 text-center">You don't have any positions yet</p>
      <button className="mt-6 px-6 py-2 bg-blue-600 text-white rounded font-bold text-[13px] hover:bg-blue-700 transition-colors">
        Get started
      </button>
    </div>
  );
}
