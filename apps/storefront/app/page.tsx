export default function Home() {
  return (
    <section className="space-y-4">
      <h1 className="text-2xl font-semibold">Find your next pair</h1>
      <form action="/search" method="get" className="flex max-w-lg gap-2">
        <label htmlFor="q" className="sr-only">
          Search products
        </label>
        <input
          id="q"
          name="q"
          type="search"
          placeholder="Search shoes"
          className="flex-1 rounded border border-zinc-300 px-3 py-2"
        />
        <button type="submit" className="rounded bg-zinc-900 px-4 py-2 text-white">
          Search
        </button>
      </form>
    </section>
  );
}
