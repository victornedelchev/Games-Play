import { Link, useNavigate, useParams } from "react-router-dom";

import { useGetOneGame } from "../../hooks/useGames";
import { useFormHook } from "../../hooks/useForm";
import { useAuthContext } from "../../contexts/authContext";
import { useCreateComment, useGetAllComments } from "../../hooks/useComments";
import gamesAPI from "../../api/games-api";

const initialValues = {
  comment: "",
};

export default function GameDetails({
  title,
  category,
  maxLevel,
  imageUrl,
  summary,
}) {
  const navigate = useNavigate();
  const { gameId } = useParams();
  const [comments, dispatch] = useGetAllComments(gameId);
  const createComment = useCreateComment();
  const [game] = useGetOneGame(gameId);
  const { userId, email, isAuthenticated } = useAuthContext();

  const { values, changeHandler, submitHandler } = useFormHook(
    initialValues,
    async ({ comment }) => {
      try {
        const newComment = await createComment(gameId, comment);
        // setComments((oldComments) => [...oldComments, newComment]);
        dispatch({
          type: "ADD_COMMENT",
          payload: { ...newComment, author: { email } },
        });
      } catch (error) {
        console.error(error.message);
      }
    }
  );

  const gameDeleteHandler = async () => {
    const isConfirmed = confirm(
      `Are you sure you want to delete ${game.title} game?`
    );
    try {
      if (isConfirmed) {
        await gamesAPI.remove(gameId);
        navigate("/");
      }
    } catch (error) {
      console.error(error);
    }
  };

  const isOwner = userId === game._ownerId;

  return (
    //     <!--Details Page-->
    <section id="game-details">
      <h1>Game Details</h1>
      <div className="info-section">
        <div className="game-header">
          <img className="game-img" src={game.imageUrl} />
          <h1>{game.title}</h1>
          <span className="levels">MaxLevel: {game.maxLevel}</span>
          <p className="type">{game.category}</p>
        </div>

        <p className="text">{game.summary}</p>

        {/* <!-- Bonus ( for Guests and Users ) --> */}
        <div className="details-comments">
          <h2>Comments:</h2>
          <ul>
            {comments.length > 0 ? (
              comments.map((comment) => (
                <li key={comment._id} className="comment">
                  <p>
                    {comment.author["email"]}: {comment.text}.
                  </p>
                </li>
              ))
            ) : (
              <p className="no-comment">No comments.</p>
            )}
          </ul>
        </div>

        {/* <!-- Edit/Delete buttons ( Only for creator of this game )  --> */}
        {isOwner && (
          <div className="buttons">
            <Link to={`/edit/${gameId}`} className="button">
              Edit
            </Link>
            <a href="#" className="button" onClick={gameDeleteHandler}>
              Delete
            </a>
          </div>
        )}
      </div>

      {/* <!-- Bonus --> */}
      {/* <!-- Add Comment ( Only for logged-in users, which is not creators of the current game ) --> */}
      {isAuthenticated && (
        <article className="create-comment">
          <label>Add new comment:</label>
          <form className="form" onSubmit={submitHandler}>
            <textarea
              name="comment"
              placeholder="Comment......"
              value={values.comment}
              onChange={changeHandler}
            ></textarea>
            <input className="btn submit" type="submit" value="Add Comment" />
          </form>
        </article>
      )}
    </section>
  );
}
