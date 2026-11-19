"use client";
import type { ReactNode } from "react";
import { DataProvider } from "@/lib/data";
import Shell from "@/components/Shell";

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DataProvider><Shell>{children}</Shell></DataProvider>;
}
