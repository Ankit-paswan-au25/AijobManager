import { Link, Navigate, useNavigate } from "react-router-dom";
import { useAuth } from "../auth/AuthContext.jsx";
import AuthForm from "../components/AuthForm.jsx";

export default function Signup() {
  const { user, loading, signup } = useAuth();
  const navigate = useNavigate();
  if (!loading && user) return <Navigate to="/" replace />;

  return (
    <AuthForm
      title="Create your account"
      submitLabel="Sign up"
      showName
      onSubmit={async ({ fullName, email, password }) => {
        await signup(fullName, email, password);
        navigate("/", { replace: true });
      }}
      footer={
        <>
          Already have an account?{" "}
          <Link className="text-indigo-600" to="/login">
            Log in
          </Link>
        </>
      }
    />
  );
}
