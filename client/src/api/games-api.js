import * as requester from "./requester";

const BASE_URL = "http://localhost:3030/data/games";
const SORTING_URL = "?sortBy=_createdOn%20desc&pageSize=3";

const getAll = async () => {
  const result = await requester.get(BASE_URL);
  const games = Object.values(result);

  return games;
};

// const createdOn = encodeURIComponent("_createdOn desc")

const getLatest = async () => {
  // const urlSearchParams = new URLSearchParams({
  //   sortBy: createdOn,
  //   pageSize: 3,
  // });

  // const latestGames = await requester.get(`${BASE_URL}?${urlSearchParams.toString()}`);

  const latestGames = await requester.get(`${BASE_URL}${SORTING_URL}`);

  return latestGames;
};

const getOne = (gameId) => requester.get(`${BASE_URL}/${gameId}`);

const create = (gameData) => requester.post(BASE_URL, gameData);

const remove = (gameId) => requester.del(`${BASE_URL}/${gameId}`);

const edit = (gameId, gameData) =>
  requester.put(`${BASE_URL}/${gameId}`, gameData);

const gamesAPI = {
  getAll,
  getLatest,
  getOne,
  create,
  remove,
  edit,
};

export default gamesAPI;
