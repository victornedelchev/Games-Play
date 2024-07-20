import GameDetails from "./components/gameDetails/GameDetails";
import Header from "./components/header/Header";
import Home from "./components/home/Home";
import Login from "./components/login/Login";
import Register from "./components/register/Register";
import CreateGame from "./components/gameCreate/CreateGame";
import GameEdit from "./components/gameEdit/GameEdit";
import GameCatalog from "./components/gameCatalog/GameCatalog";

function App() {
  return (
    <div id="box">
      <Header />
      {/* <!-- Main Content --> */}
      <main id="main-content">
        <Home />
        <Login />
        <Register />
        <CreateGame />
        <GameEdit />
        <GameDetails />
        <GameCatalog />
      </main>
    </div>
  );
}

export default App;
