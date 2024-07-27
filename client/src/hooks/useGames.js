import { useEffect, useState } from "react";

import gamesAPI from "../api/games-api";

export function useGetAllGames() {
  const [games, setGames] = useState([]);

  useEffect(() => {
    gamesAPI.getAll().then((result) => setGames(result));
  }, []);

  return [games, setGames];
}
