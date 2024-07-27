import { createContext } from "react";

export const AuthContext = createContext({
  // This is for documentation
  userId: "",
  email: "",
  accessToken: "",
  isAuthenticated: false,
  changeAuthState: (authState = {}) => null,
});
