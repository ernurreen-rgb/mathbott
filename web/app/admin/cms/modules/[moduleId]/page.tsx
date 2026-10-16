import { notFound } from "next/navigation";
import CmsWorkspace from "@/app/admin/cms/_components/CmsWorkspace";

export default async function Page({ params }: { params: Promise<{ moduleId: string }> }) {
  const route = await params;
  const ids = { moduleId: Number(route.moduleId) };
  if (Object.values(ids).some((id) => !Number.isSafeInteger(id) || id <= 0)) notFound();
  return <CmsWorkspace key={ids.moduleId} moduleId={ids.moduleId} />;
}
