import { CatalogList, catalogTitle, type ListSearch } from "@/components/catalog/CatalogList";
type Params = Promise<{ resource: string }>;
export const generateMetadata = ({ params }: { params: Params }) => catalogTitle("team", params);
export default function Page({ params, searchParams }: { params: Params; searchParams: ListSearch }) {
  return <CatalogList section="team" params={params} searchParams={searchParams} />;
}
