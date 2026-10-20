import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthForm from "../components/AuthForm.jsx";

export default function Login() {
  const { user, loading, login } = useAuth();
  const navigate = useNavigate();
  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <AuthForm
      title="Log in"
      submitLabel="Log in"
      onSubmit={async ({ email, password }) => {
        await login(email, password);
        navigate("/", { replace: true });
      }}
      footer={
        <>
          New here?{" "}
          <Link className="text-indigo-600" to="/signup">
            Create an account
          </Link>
        </>
      }
    />
  );
}
