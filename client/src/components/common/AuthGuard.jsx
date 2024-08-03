import { Navigate } from "react-router-dom";
import { useAuthContext } from "../../contexts/authContext";

export default function AuthGuard({ children }) {
  const { isAuthenticated } = useAuthContext();

  if (!isAuthenticated) {
    return <Navigate to="/login" />;
  }

  return <>{children}</>;
}
