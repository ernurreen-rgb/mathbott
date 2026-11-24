"use client";

import { useParams } from "next/navigation";
import AuthRedirectScreen from "@/components/AuthRedirectScreen";
import DesktopNav from "@/components/DesktopNav";
import MobileNav from "@/components/MobileNav";
import { useRequireAuth } from "@/lib/use-require-auth";
import CollectionEditor from "../_components/CollectionEditor";

export default function ConstructorCollectionPage() {
  const { data: session, status } = useRequireAuth();
  const params = useParams<{ id: string }>();
  const collectionId = Number(params?.id);

  if (status === "loading" || !session?.user?.email) {
    return <AuthRedirectScreen loading={status === "loading"} />;
  }

  return (
    <div className="min-h-screen bg-slate-50 pb-24 md:pb-10 md:pl-64">
      <DesktopNav currentPage="constructor" />
      <MobileNav currentPage="constructor" />
      {Number.isInteger(collectionId) && collectionId > 0 ? (
        <CollectionEditor
          key={collectionId}
          collectionId={collectionId}
          email={session.user.email}
          author={session.user.name || session.user.email}
        />
      ) : (
        <p className="px-4 pt-16 text-center text-slate-600">404</p>
      )}
    </div>
  );
}
