"use client";

import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { useRequireAuth } from "@/lib/use-require-auth";
import CollectionEditor from "../_components/CollectionEditor";

export default function NewConstructorCollectionPage() {
  const { data: session, status } = useRequireAuth();

  if (status === "loading" || !session?.user?.email) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10 md:pl-64">
      <DesktopNav currentPage="constructor" />
      <MobileNav currentPage="constructor" />
      <CollectionEditor
        collectionId={null}
        email={session.user.email}
        author={session.user.name || session.user.email}
      />
    </div>
  );
}
