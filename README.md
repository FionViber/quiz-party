# Quiz Party · 问答派对

[在线游玩](https://fionviber.github.io/quiz-party/)

Quiz Party is a shared-screen trivia game for 2–8 players. Open `index.html` in a modern browser to play. No installation or account is required.

## Play

Add players, choose a mode, select a question pack, and choose the categories to include. The board is built from the selected categories. Use the arrow keys and Enter to choose a tile. Choice questions use number keys 1–6. Every other active button shows its own single-key shortcut.

In 一起回答, everyone answers multiple-choice questions together. A wrong choice has no penalty. A buzz-in question is answered by one player and a wrong answer loses half its value. In 一起抢答, one player answers every question. A correct answer earns the full value and a wrong answer loses half. In 轮流回答, players answer in order. Multiple-choice mistakes have no penalty and buzz-in mistakes lose half the value.

Multiple-choice questions are worth 100, 200, 300, or 400 points. Buzz-in questions are worth 200, 400, 600, or 800 points. When judging a group of players, use 全对 or 全错 to apply the same result quickly.

The results page shows scores, rankings, score progression, correct-answer counts, and the full game duration together. The results image contains the same complete page. Finished games are saved to local history automatically. Save exports include that history. Question packs can be imported and exported separately.

## Source package

- `src/` contains game logic, interface copy, and styles.
- `data/packs/builtin-bank.json` is the editable built-in question bank.
- `assets/` contains the local font and background music.
- `tools/` contains validation and packaging commands.
- `docs/` describes the save format, question-bank format, and source records.

Use Python 3.10 or newer and run `python tools/package.py --output ../Quiz-Party` from this folder to build a playable directory. The output directory must be empty.
