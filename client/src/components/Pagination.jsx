/** Previous / Next for a paginated response ({ page, pageSize, total }). */
export default function Pagination({ data, onPage }) {
  if (!data) return null;
  const pages = Math.max(1, Math.ceil(data.total / data.pageSize));
  const button = "rounded border border-slate-300 px-3 py-1 text-sm disabled:opacity-40";
  return (
    <nav aria-label="Pagination" className="mt-4 flex items-center gap-3 text-sm text-slate-600">
      <button className={button} disabled={data.page <= 1} onClick={() => onPage(data.page - 1)}>
        Previous
      </button>
      <span>
        Page {data.page} of {pages} · {data.total} total
      </span>
      <button className={button} disabled={data.page >= pages} onClick={() => onPage(data.page + 1)}>
        Next
      </button>
    </nav>
  );
}
