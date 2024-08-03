import { useNavigate, useParams } from "react-router-dom";

import { useFormHook } from "../../hooks/useForm";
import { useGetOneGame } from "../../hooks/useGames";
import gamesAPI from "../../api/games-api";

const initialValues = {
  title: "",
  category: "",
  maxLevel: "",
  imageUrl: "",
  summary: "",
};

export default function GameEdit() {
  const { gameId } = useParams();
  const [game, setGame] = useGetOneGame(gameId);
  const navigate = useNavigate();

  const { values, changeHandler, submitHandler } = useFormHook(
    Object.assign(initialValues, game),
    async (values) => {
      const isConfirmed = confirm(
        `Are you sure you want to edit ${values.title} game?`
      );

      if (isConfirmed) {
        const editedGame = await gamesAPI.edit(gameId, values);
        setGame(editedGame);
        navigate(`/details/${gameId}`);
      }
    }
  );

  return (
    // <!-- Edit Page ( Only for the creator )-->
    <section id="edit-page" className="auth">
      <form id="edit" onSubmit={submitHandler}>
        <div className="container">
          <h1>Edit Game</h1>
          <label htmlFor="leg-title">Legendary title:</label>
          <input
            type="text"
            id="title"
            name="title"
            value={values.title}
            onChange={changeHandler}
          />

          <label htmlFor="category">Category:</label>
          <input
            type="text"
            id="category"
            name="category"
            value={values.category}
            onChange={changeHandler}
          />

          <label htmlFor="levels">MaxLevel:</label>
          <input
            type="number"
            id="maxLevel"
            name="maxLevel"
            min="1"
            value={values.maxLevel}
            onChange={changeHandler}
          />

          <label htmlFor="game-img">Image:</label>
          <input
            type="text"
            id="imageUrl"
            name="imageUrl"
            value={values.imageUrl}
            onChange={changeHandler}
          />

          <label htmlFor="summary">Summary:</label>
          <textarea
            name="summary"
            id="summary"
            value={values.summary}
            onChange={changeHandler}
          ></textarea>
          <input className="btn submit" type="submit" value="Edit Game" />
        </div>
      </form>
    </section>
  );
}
