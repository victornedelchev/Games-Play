import { login } from "../api/auth-api";

export const useLogin = () => {
  const loginHandler = async (email, password) => {
    const result = await login(email, password);
    // TODO: update app state
  };

  return loginHandler;
};
