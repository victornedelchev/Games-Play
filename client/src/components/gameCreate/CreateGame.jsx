import { useNavigate } from "react-router-dom";

import { useFormHook } from "../../hooks/useForm";
import { useCreateGame } from "../../hooks/useGames";

export default function CreateGame() {
  const navigate = useNavigate();
  const createGame = useCreateGame();

  const initialValues = {
    title: "",
    category: "",
    maxLevel: "",
    imageUrl: "",
    summary: "",
  };

  const createHandler = async (values) => {
    try {
      const { _id: gameId } = await createGame(values);
      navigate(`/details/${gameId}`);
    } catch (error) {
      console.error(error);
    }
  };

  const { values, changeHandler, submitHandler } = useFormHook(
    initialValues,
    createHandler
  );

  return (
    // <!-- Create Page ( Only for logged-in users ) -->
    <section id="create-page" className="auth">
      <form id="create" onSubmit={submitHandler}>
        <div className="container">
          <h1>Create Game</h1>
          <label htmlFor="leg-title">Legendary title:</label>
          <input
            type="text"
            id="title"
            name="title"
            placeholder="Enter game title..."
            value={values.title}
            onChange={changeHandler}
          />

          <label htmlFor="category">Category:</label>
          <input
            type="text"
            id="category"
            name="category"
            placeholder="Enter game category..."
            value={values.category}
            onChange={changeHandler}
          />

          <label htmlFor="levels">MaxLevel:</label>
          <input
            type="number"
            id="maxLevel"
            name="maxLevel"
            min="1"
            placeholder="1"
            value={values.maxLevel}
            onChange={changeHandler}
          />

          <label htmlFor="game-img">Image:</label>
          <input
            type="text"
            id="imageUrl"
            name="imageUrl"
            placeholder="Upload a photo..."
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
          <input className="btn submit" type="submit" value="Create Game" />
        </div>
      </form>
    </section>
  );
}
