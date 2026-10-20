import { useCallback, useEffect, useState } from "react";
import { api } from "../api/client.js";

/**
 * Loads one page of a paginated admin list: GET `${path}?page=..&page_size=..&...params`.
 * Returns the response (which has page, pageSize, total) plus helpers. `params` values that are empty are left out.
 */
export function usePaged(path, params = {}, pageSize = 20) {
  const [page, setPage] = useState(1);
  const [data, setData] = useState(null);
  const [error, setError] = useState("");
  const key = JSON.stringify(params);

  // A different filter starts again from page 1.
  useEffect(() => setPage(1), [key]);

  const load = useCallback(() => {
    const query = new URLSearchParams({ page: String(page), page_size: String(pageSize) });
    for (const [k, v] of Object.entries(JSON.parse(key))) if (v) query.set(k, v);
    return api(`${path}?${query}`)
      .then((d) => {
        setData(d);
        setError("");
      })
      .catch((err) => setError(err.message));
  }, [path, page, pageSize, key]);

  useEffect(() => {
    load();
  }, [load]);

  return { data, error, page, setPage, reload: load };
}
