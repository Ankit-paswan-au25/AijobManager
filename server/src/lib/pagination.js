export const limitOffset = ({ page, pageSize }) => ({ limit: pageSize, offset: (page - 1) * pageSize });
