import random
from dataclasses import dataclass, field
from pathlib import Path
from typing import Annotated

from fastapi import FastAPI, Depends, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
import wordhunt_cpp

app = FastAPI()
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def read_root():
    return {"Hello": "World"}


@app.get("/items/{item_id}")
def read_item(item_id: int, q: str | None = None):
    return {"item_id": item_id, "q": q}


class User(BaseModel):
    username: str


@dataclass
class Game:
    board: str
    words: list[str]
    player1: User
    player2: User = field(default_factory=lambda: User(username=""))
    player1_score: int = 0
    player2_score: int = 0
    player1_done: bool = False
    player2_done: bool = False
    player1_found_words: list[str] = field(default_factory=list)
    player2_found_words: list[str] = field(default_factory=list)


DICT = wordhunt_cpp.Dictionary(
    str((Path(__file__).resolve().parent.parent / "solver" / "words.txt").resolve())
)


games: dict[int, Game] = {}
num_games = 0


class JoinableGame(BaseModel):
    game_id: int
    host: str


class SubmitResultsRequest(BaseModel):
    username: str
    words: list[str]


@app.get(path="/create_game")
def create_game(user: Annotated[User, Depends()]) -> int:  # game_id 
    global num_games
    game_id = num_games
    words: list[str] = []
    total_score = 0
    board: str = ""
    # Keep generating until the board's max score exceeds the threshold.
    while total_score <= 300_000:
        board = wordhunt_cpp.generate_board(random.randint(0, 100000000))
        words, total_score = DICT.solve(board)
    games[game_id] = Game(board=board, words=words, player1=user)
    num_games += 1
    return game_id


@app.get(path="/open_games")
def open_games() -> list[JoinableGame]:
    return [
        JoinableGame(game_id=game_id, host=game.player1.username)
        for game_id, game in games.items()
        if not game.player2.username
    ]


@app.post(path="/join_game")
def join_game(game_id: int, user: User) -> Game:
    game = games.get(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")
    if game.player2.username:
        raise HTTPException(status_code=400, detail="Game already has two players")
    if user.username == game.player1.username:
        raise HTTPException(status_code=400, detail="Player already joined as player1")

    game.player2 = user
    return game


@app.get(path="/game")
def get_game(game_id: int) -> Game | None:
    return games.get(game_id)


def _score_words(words: list[str]) -> int:
    return sum(wordhunt_cpp.word_score(len(w)) for w in words)


@app.post(path="/submit_results")
def submit_results(game_id: int, payload: SubmitResultsRequest) -> Game:
    game = games.get(game_id)
    if game is None:
        raise HTTPException(status_code=404, detail="Game not found")

    normalized_words = []
    seen = set()
    for w in payload.words:
        w_norm = "".join(ch for ch in w.lower() if ch.isalpha())
        if len(w_norm) < 3 or w_norm in seen:
            continue
        seen.add(w_norm)
        normalized_words.append(w_norm)

    if payload.username == game.player1.username:
        game.player1_found_words = normalized_words
        game.player1_score = _score_words(normalized_words)
        game.player1_done = True
    elif payload.username == game.player2.username:
        game.player2_found_words = normalized_words
        game.player2_score = _score_words(normalized_words)
        game.player2_done = True
    else:
        raise HTTPException(status_code=400, detail="Username does not match this game")

    return game


if __name__ == "__main__":
    import uvicorn

    uvicorn.run(
        "server.server:app",
        host="0.0.0.0",  # Bind to all interfaces so other devices can reach it.
        port=8000,
        reload=True,
    )
