"use client";

import { useSession } from "next-auth/react";
import StatisticsWorkspace from "./_components/StatisticsWorkspace";

export default function AdminStatisticsPage() {
  const { data: session } = useSession();
  return <StatisticsWorkspace key={session?.user?.email || "anonymous"} />;
}
