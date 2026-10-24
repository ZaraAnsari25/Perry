import { SearchResults } from "@/components/search-results";
import { searchProducts } from "@/lib/search";

export default async function SearchPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[] }>;
}) {
  const { q } = await searchParams;
  const query = typeof q === "string" ? q : "";
  const results = searchProducts(query);

  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">
        {query ? `Results for "${query}"` : "All products"}
      </h1>
      <SearchResults results={results} />
    </section>
  );
}
