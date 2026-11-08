"use client";

import { useSession } from "next-auth/react";
import BankWorkspace from "./_components/BankWorkspace";

export default function AdminBankPage() {
  const { data: session } = useSession();
  return <BankWorkspace key={session?.user?.email || "anonymous"} />;
}
