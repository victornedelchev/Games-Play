import { useEffect, useState } from "react";

import gamesAPI from "../../api/games-api";

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
      {games.length > 0 ? (
        games.map((game) => <GameListItem key={game._id} {...game} />)
      ) : (
        <h3 className="no-articles">No articles yet</h3>
      )}
    </section>
  );
}
