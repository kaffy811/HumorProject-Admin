import { CatalogRecord, recordTitle } from "@/components/catalog/CatalogRecord";
type Params = Promise<{ resource: string; id: string }>;
export const generateMetadata = ({ params }: { params: Params }) => recordTitle("team", params);
export default function Page({ params, searchParams }: { params: Params; searchParams: Promise<{ blocked?: string }> }) {
  return <CatalogRecord section="team" params={params} searchParams={searchParams} />;
}
