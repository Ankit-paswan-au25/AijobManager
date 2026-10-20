import { Navigate, Outlet } from "react-router-dom";
import { useAuth } from "./AuthContext.jsx";

/** UI convenience only. The server enforces is_admin on every /api/admin route. Mount inside ProtectedRoute. */
export default function AdminRoute() {
  const { user } = useAuth();
  return user?.isAdmin ? <Outlet /> : <Navigate to="/" replace />;
}
