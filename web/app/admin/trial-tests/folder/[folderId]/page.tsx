import { notFound } from "next/navigation";
import TrialTestsCatalog from "../../_components/TrialTestsCatalog";

export default async function Page({ params }: { params: Promise<{ folderId: string }> }) {
  const { folderId } = await params;
  const id = Number(folderId);
  if (!/^\d+$/.test(folderId) || !Number.isSafeInteger(id) || id <= 0) notFound();
  return <TrialTestsCatalog key={id} folderId={id} />;
}
