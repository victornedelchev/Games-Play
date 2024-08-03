import * as requester from "./requester";

const BASE_URL = "http://localhost:3030/data/games";

const getAll = async () => {
  const result = await requester.get(BASE_URL);
  const games = Object.values(result);

  return games;
};

const getOne = (gameId) => requester.get(`${BASE_URL}/${gameId}`);

const create = (gameData) => requester.post(BASE_URL, gameData);

const remove = (gameId) => requester.del(`${BASE_URL}/${gameId}`);

const edit = (gameId, gameData) =>
  requester.put(`${BASE_URL}/${gameId}`, gameData);

const gamesAPI = {
  getAll,
  getOne,
  create,
  remove,
  edit,
};

export default gamesAPI;
