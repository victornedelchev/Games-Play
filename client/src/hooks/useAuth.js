import { useContext } from "react";

import { login, register } from "../api/auth-api";
import { AuthContext } from "../contexts/authContext";

export const useLogin = () => {
  const { changeAuthState } = useContext(AuthContext);

  const loginHandler = async (email, password) => {
    // password: _password -> remove password from state
    const {password: _password, ...authData } = await login(email, password);
    changeAuthState(authData);

    return authData;
  };

  return loginHandler;
};

export const useRegister = () => {
  const { changeAuthState } = useContext(AuthContext);

  const registerHandler = async (email, password) => {
    const {password: _password, ...authData } = await register(email, password);
    changeAuthState(authData);

    return authData;
  };

  return registerHandler;
};
