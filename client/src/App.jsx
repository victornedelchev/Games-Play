import { Route, Routes } from "react-router-dom";

import GameDetails from "./components/gameDetails/GameDetails";
import Header from "./components/header/Header";
import Home from "./components/home/Home";
import Login from "./components/login/Login";
import Register from "./components/register/Register";
import CreateGame from "./components/gameCreate/CreateGame";
import GameEdit from "./components/gameEdit/GameEdit";
import GameCatalog from "./components/gameCatalog/GameCatalog";
import { AuthContextProvider } from "./contexts/authContext";
import Logout from "./components/logout/Logout";

function App() {

  return (
    <AuthContextProvider>
      <div id="box">
        <Header />
        {/* <!-- Main Content --> */}
        <main id="main-content">
          <Routes>
            <Route path="/" element={<Home />} />
            <Route path="/login" element={<Login />} />
            <Route path="/register" element={<Register />} />
            <Route path="/logout" element={<Logout />} />
            <Route path="/create" element={<CreateGame />} />
            <Route path="/edit/:gameId" element={<GameEdit />} />
            <Route path="/details/:gameId" element={<GameDetails />} />
            <Route path="/catalog" element={<GameCatalog />} />
          </Routes>
        </main>
      </div>
    </AuthContextProvider>
  );
}

export default App;
