import { CatalogList, catalogTitle, type ListSearch } from "@/components/catalog/CatalogList";
type Params = Promise<{ resource: string }>;
export const generateMetadata = ({ params }: { params: Params }) => catalogTitle("ai", params);
export default function Page({ params, searchParams }: { params: Params; searchParams: ListSearch }) {
  return <CatalogList section="ai" params={params} searchParams={searchParams} />;
}
