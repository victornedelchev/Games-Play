import { useAuthContext } from "../contexts/authContext";

export default function withAuth(Component) {
  const ComponentWrapper = (props) => {
    const authContext = useAuthContext();
    return <Component {...props} auth={authContext} />;
  };

  return ComponentWrapper;
}
