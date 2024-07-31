import { login, register, logout } from "../api/auth-api";
import { useAuthContext } from "../contexts/authContext";

export const useLogin = () => {
  const { changeAuthState } = useAuthContext();

  const loginHandler = async (email, password) => {
    // password: _password -> remove password from state
    const { password: _password, ...authData } = await login(email, password);
    changeAuthState(authData);

    return authData;
  };

  return loginHandler;
};

export const useRegister = () => {
  const { changeAuthState } = useAuthContext();

  const registerHandler = async (email, password) => {
    const { password: _password, ...authData } = await register(
      email,
      password
    );
    changeAuthState(authData);

    return authData;
  };

  return registerHandler;
};

export const useLogout = () => {
  const { logout: localLogout } = useAuthContext();

  const logoutHandler = async () => {
    localLogout();
    await logout();
  };

  return logoutHandler;
};
