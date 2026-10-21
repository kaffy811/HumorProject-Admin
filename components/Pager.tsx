import Link from "next/link";
export function Pager({ page, total, size, base, params }: { page: number; total: number; size: number; base: string; params: Record<string, string> }) {
  const pages = Math.max(1, Math.ceil(total / size));
  const href = (target: number) => {
    const query = new URLSearchParams({ ...Object.fromEntries(Object.entries(params).filter(([, v]) => v)), page: String(target) });
    return `${base}?${query}`;
  };
  return (
    <nav className="pager" aria-label="Pagination">
      <span className="num">{total ? `${(page - 1) * size + 1}–${Math.min(total, page * size)} of ${total}` : "No results"}</span>
      <span style={{ display: "flex", gap: 8 }}>
        {page > 1 ? <Link className="btn" href={href(page - 1)}>← Previous</Link> : <span className="btn" aria-disabled="true" style={{ opacity: 0.4 }}>← Previous</span>}
        {page < pages ? <Link className="btn" href={href(page + 1)}>Next →</Link> : <span className="btn" aria-disabled="true" style={{ opacity: 0.4 }}>Next →</span>}
      </span>
    </nav>
  );
}
