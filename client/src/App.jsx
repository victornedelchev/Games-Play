import { useState } from "react";
import { Route, Routes } from "react-router-dom";

import GameDetails from "./components/gameDetails/GameDetails";
import Header from "./components/header/Header";
import Home from "./components/home/Home";
import Login from "./components/login/Login";
import Register from "./components/register/Register";
import CreateGame from "./components/gameCreate/CreateGame";
import GameEdit from "./components/gameEdit/GameEdit";
import GameCatalog from "./components/gameCatalog/GameCatalog";
import { AuthContext } from "./contexts/authContext";

function App() {
  const [authState, setAuthState] = useState({});

  const changeAuthState = (state) => {
    setAuthState(state);
  };

  const authData = {
    email: authState.email,
    accessToken: authState.accessToken,
    isAuthenticated: !!authState.email,
    changeAuthState,
  };

  return (
    <AuthContext.Provider value={authData}>
      <div id="box">
        <Header />
        {/* <!-- Main Content --> */}
        <main id="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/create" element={<CreateGame />} />
            <Route path="/edit/:gameId" element={<GameEdit />} />
            <Route path="/details/:gameId" element={<GameDetails />} />
            <Route path="/catalog" element={<GameCatalog />} />
          </Routes>
        </main>
      </div>
    </AuthContext.Provider>
  );
}

export default App;
