import { z } from "zod";
import { DEFAULT_PAGE_SIZE, MAX_PAGE_SIZE } from "../config/admin.js";

/** ?page=1&page_size=20 (blank values are treated as not provided by validateQuery). */
export const paginationShape = {
  page: z.coerce.number().int().min(1).max(100000).default(1),
  page_size: z.coerce.number().int().min(1).max(MAX_PAGE_SIZE).default(DEFAULT_PAGE_SIZE),
};

/** Validated query -> { page, pageSize } for services. */
export const pageOf = (query) => ({ page: query.page, pageSize: query.page_size });
