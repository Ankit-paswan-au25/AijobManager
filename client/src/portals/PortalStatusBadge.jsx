const STYLES = {
  approved: "bg-green-100 text-green-800",
  pending: "bg-amber-100 text-amber-800",
  rejected: "bg-red-100 text-red-800",
};
const LABELS = { approved: "Approved", pending: "Under review", rejected: "Rejected" };

export default function PortalStatusBadge({ status }) {
  return (
    <span className={`rounded-full px-2 py-0.5 text-xs font-medium ${STYLES[status]}`}>
      {LABELS[status] ?? status}
    </span>
  );
}
