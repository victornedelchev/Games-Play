import { useEffect, useState } from "react";

import * as gamesAPI from "../../api/games-api";
import GameListItem from "../gameCatalog/gameListItem/GameLIstItem";

export default function GameCatalog() {
  const [games, setGames] = useState([]);

  useEffect(() => {
    gamesAPI.getAll().then((result) => setGames(result));
  }, []);

  return (
    // <!-- Catalogue -->
    <section id="catalog-page">
      <h1>All Games</h1>
      {/* <!-- Display div: with information about every game (if any) --> */}
      {games.map((game) => (
        <GameListItem key={game._id} {...game} />
      ))}
      {/* <!-- Display paragraph: If there is no games  --> */}
      <h3 className="no-articles">No articles yet</h3>
    </section>
  );
}
