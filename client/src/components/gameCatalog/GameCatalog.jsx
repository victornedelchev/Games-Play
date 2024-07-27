import GameListItem from "../gameCatalog/gameListItem/GameLIstItem";
import { useGetAllGames } from "../../hooks/useGames";

export default function GameCatalog() {
  const [games] = useGetAllGames();

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
