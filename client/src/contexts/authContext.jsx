import { createContext, useContext } from "react";

import usePersistedState from "../hooks/usePersistedState";

export const AuthContext = createContext({
  // This is for documentation
  userId: "",
  email: "",
  accessToken: "",
  isAuthenticated: false,
  changeAuthState: (authState = {}) => null,
  logout: () => null,
});

export function AuthContextProvider(props) {
  const [authState, setAuthState] = usePersistedState("auth", {});

  const changeAuthState = (state) => {
    setAuthState(state);
  };

  const logout = () => {
    setAuthState(null); // local logout
  };

  const contextData = {
    userId: authState?._id,
    email: authState?.email,
    accessToken: authState?.accessToken,
    isAuthenticated: !!authState?.email,
    changeAuthState,
    logout,
  };

  return (
    <AuthContext.Provider value={contextData}>
      {props.children}
    </AuthContext.Provider>
  );
}

export function useAuthContext() {
  const authData = useContext(AuthContext);

  return authData;
}
