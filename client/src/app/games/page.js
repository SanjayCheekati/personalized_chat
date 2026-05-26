"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";

const AUTH_KEY = "flashchat.auth";

const GAMES = [
  {
    id: "tap",
    title: "Tap Race",
    subtitle: "10-second speed duel",
    status: "Fast taps"
  },
  {
    id: "reaction",
    title: "Reaction Duel",
    subtitle: "First after GO wins",
    status: "Best of 3"
  },
  {
    id: "tic",
    title: "Tic Tac Toe",
    subtitle: "Classic 3x3 strategy",
    status: "Take turns"
  },
  {
    id: "connect",
    title: "Connect Four",
    subtitle: "Drop and link four",
    status: "First to connect"
  },
  {
    id: "dice",
    title: "Dice Duel",
    subtitle: "Highest roll wins",
    status: "Luck battle"
  }
];

export default function GamesPage() {
  const router = useRouter();
  const [auth, setAuth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeGameId, setActiveGameId] = useState(GAMES[0]?.id || "tap");

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (!stored) {
      setLoading(false);
      router.replace("/");
      return;
    }

    try {
      setAuth(JSON.parse(stored));
    } catch {
      localStorage.removeItem(AUTH_KEY);
      router.replace("/");
    } finally {
      setLoading(false);
    }
  }, [router]);

  const playerOne = auth?.user?.name || auth?.user?.username || "Player 1";
  const playerTwo = "Player 2";
  const activeGame = useMemo(
    () => GAMES.find((game) => game.id === activeGameId) || GAMES[0],
    [activeGameId]
  );

  if (loading) {
    return (
      <div className="page-shell games-shell">
        <div className="flex h-[100dvh] min-h-[100dvh] w-full items-center justify-center px-6">
          <div className="w-full max-w-sm rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] p-6 text-center shadow-glow animate-fade-in">
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent)]">FlashChat</p>
            <p className="mt-3 text-sm text-[var(--ink-soft)]">Loading the arena...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!auth) {
    return null;
  }

  return (
    <div className="page-shell games-shell">
      <div className="flex h-[100dvh] min-h-[100dvh] w-full flex-col">
        <header className="sticky top-0 z-30 border-b border-[var(--panel-border)] bg-[var(--panel)] px-4 py-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent)]">FlashChat</p>
              <p className="mt-1 text-lg font-semibold text-[var(--ink)]">2 Player Arena</p>
              <p className="text-xs text-[var(--ink-soft)]">Pass the phone and duel.</p>
            </div>
            <button
              type="button"
              onClick={() => router.push("/")}
              className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
            >
              Back to chat
            </button>
          </div>
        </header>

        <main className="flex min-h-0 flex-1 flex-col gap-4 overflow-y-auto px-4 pb-6 pt-4">
          <section className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-4 shadow-glow animate-fade-in">
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent)]">
                  Pick a duel
                </p>
                <p className="mt-2 text-base font-semibold text-[var(--ink)]">
                  {activeGame?.title || "Choose a game"}
                </p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {activeGame?.subtitle || "Select a game card below."}
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <PlayerTag label={playerOne} tone="one" />
                <span className="text-xs text-[var(--ink-soft)]">vs</span>
                <PlayerTag label={playerTwo} tone="two" />
              </div>
            </div>
          </section>

          <section className="no-scrollbar flex gap-3 overflow-x-auto pb-1">
            {GAMES.map((game) => {
              const isActive = game.id === activeGameId;
              return (
                <button
                  key={game.id}
                  type="button"
                  onClick={() => setActiveGameId(game.id)}
                  className={`min-w-[220px] flex-1 snap-start rounded-3xl border px-4 py-4 text-left transition ${
                    isActive
                      ? "border-[var(--accent)] bg-[var(--panel)] shadow-glow"
                      : "border-[var(--panel-border)] bg-[var(--panel-dark)]"
                  }`}
                  aria-pressed={isActive}
                >
                  <p className="text-sm font-semibold text-[var(--ink)]">{game.title}</p>
                  <p className="mt-1 text-xs text-[var(--ink-soft)]">{game.subtitle}</p>
                  <span className="mt-3 inline-flex rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1 text-[10px] uppercase tracking-[0.3em] text-[var(--ink-soft)]">
                    {game.status}
                  </span>
                </button>
              );
            })}
          </section>

          <section className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel)] p-4 shadow-glow animate-pop">
            {activeGameId === "tap" ? (
              <TapRaceGame playerOne={playerOne} playerTwo={playerTwo} />
            ) : null}
            {activeGameId === "reaction" ? (
              <ReactionDuelGame playerOne={playerOne} playerTwo={playerTwo} />
            ) : null}
            {activeGameId === "tic" ? (
              <TicTacToeGame playerOne={playerOne} playerTwo={playerTwo} />
            ) : null}
            {activeGameId === "connect" ? (
              <ConnectFourGame playerOne={playerOne} playerTwo={playerTwo} />
            ) : null}
            {activeGameId === "dice" ? (
              <DiceDuelGame playerOne={playerOne} playerTwo={playerTwo} />
            ) : null}
          </section>
        </main>
      </div>
    </div>
  );
}

function PlayerTag({ label, tone }) {
  const textClass = tone === "two" ? "text-[var(--accent-warm)]" : "text-[var(--accent)]";
  const borderClass = tone === "two" ? "border-[var(--accent-warm)]" : "border-[var(--accent)]";

  return (
    <span
      className={`inline-flex items-center rounded-full border px-3 py-1 text-[11px] font-semibold ${textClass} ${borderClass}`}
    >
      {label}
    </span>
  );
}

function PlayerScoreCard({ label, score, tone, active }) {
  const textClass = tone === "two" ? "text-[var(--accent-warm)]" : "text-[var(--accent)]";
  const ringClass =
    active && tone === "two"
      ? "ring-2 ring-[var(--accent-warm)]"
      : active
      ? "ring-2 ring-[var(--accent)]"
      : "";

  return (
    <div
      className={`flex-1 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-3 ${ringClass}`}
    >
      <p className="text-[10px] uppercase tracking-[0.3em] text-[var(--ink-soft)]">
        {label}
      </p>
      <p className={`mt-2 text-2xl font-semibold ${textClass}`}>{score}</p>
    </div>
  );
}

function TapRaceGame({ playerOne, playerTwo }) {
  const DURATION = 10;
  const COUNTDOWN = 3;
  const [phase, setPhase] = useState("idle");
  const [countdown, setCountdown] = useState(COUNTDOWN);
  const [timeLeft, setTimeLeft] = useState(DURATION);
  const [scores, setScores] = useState({ p1: 0, p2: 0 });
  const [winner, setWinner] = useState("");

  useEffect(() => {
    if (phase !== "countdown") {
      return;
    }
    if (countdown <= 0) {
      setPhase("play");
      setTimeLeft(DURATION);
      return;
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [phase, countdown]);

  useEffect(() => {
    if (phase !== "play") {
      return;
    }
    if (timeLeft <= 0) {
      const nextWinner =
        scores.p1 === scores.p2
          ? "Tie"
          : scores.p1 > scores.p2
          ? playerOne
          : playerTwo;
      setWinner(nextWinner);
      setPhase("done");
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [phase, timeLeft, scores, playerOne, playerTwo]);

  const start = () => {
    setScores({ p1: 0, p2: 0 });
    setWinner("");
    setCountdown(COUNTDOWN);
    setTimeLeft(DURATION);
    setPhase("countdown");
  };

  const tap = (player) => {
    if (phase !== "play") {
      return;
    }
    setScores((prev) => ({ ...prev, [player]: prev[player] + 1 }));
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Tap Race</p>
          <p className="text-xs text-[var(--ink-soft)]">
            {phase === "play" ? `${timeLeft}s left` : "Fastest fingers win"}
          </p>
        </div>
        <button
          type="button"
          onClick={start}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          {phase === "play" || phase === "countdown" ? "Restart" : "Start"}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <PlayerScoreCard label={playerOne} score={scores.p1} tone="one" active={phase === "play"} />
        <PlayerScoreCard label={playerTwo} score={scores.p2} tone="two" active={phase === "play"} />
      </div>

      <div className="relative grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => tap("p1")}
          className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] text-[var(--accent)]"
        >
          <span className="text-xs uppercase tracking-[0.4em]">Tap</span>
          <span className="text-sm font-semibold">{playerOne}</span>
        </button>
        <button
          type="button"
          onClick={() => tap("p2")}
          className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] text-[var(--accent-warm)]"
        >
          <span className="text-xs uppercase tracking-[0.4em]">Tap</span>
          <span className="text-sm font-semibold">{playerTwo}</span>
        </button>
        {phase === "countdown" ? (
          <div className="absolute inset-0 flex items-center justify-center rounded-3xl bg-[rgba(11,20,26,0.85)] text-4xl font-semibold text-white">
            {countdown}
          </div>
        ) : null}
      </div>

      {phase === "done" ? (
        <p className="text-center text-xs text-[var(--ink-soft)]">
          {winner === "Tie" ? "Tie round." : `${winner} wins the round.`}
        </p>
      ) : null}
    </div>
  );
}

function ReactionDuelGame({ playerOne, playerTwo }) {
  const WIN_TARGET = 3;
  const [phase, setPhase] = useState("idle");
  const [wins, setWins] = useState({ p1: 0, p2: 0 });
  const [round, setRound] = useState(1);
  const [message, setMessage] = useState("Tap start to begin.");
  const [result, setResult] = useState("");
  const [matchWinner, setMatchWinner] = useState("");
  const timerRef = useRef(null);
  const goTimeRef = useRef(0);

  const clearTimer = () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  };

  useEffect(() => {
    return () => clearTimer();
  }, []);

  const scheduleGo = () => {
    clearTimer();
    setPhase("waiting");
    setResult("");
    setMessage("Wait for GO...");

    timerRef.current = setTimeout(() => {
      setPhase("go");
      setMessage("GO!");
      goTimeRef.current = Date.now();
    }, 700 + Math.random() * 1200);
  };

  const startMatch = () => {
    setWins({ p1: 0, p2: 0 });
    setRound(1);
    setMatchWinner("");
    scheduleGo();
  };

  const finishRound = (winnerKey, reaction, early) => {
    clearTimer();
    setPhase("result");
    const winnerName = winnerKey === "p1" ? playerOne : playerTwo;
    setResult(
      early
        ? `${winnerName} wins (false start).`
        : `${winnerName} wins in ${reaction}ms.`
    );

    setWins((prev) => {
      const next = { ...prev, [winnerKey]: prev[winnerKey] + 1 };
      if (next[winnerKey] >= WIN_TARGET) {
        setMatchWinner(winnerName);
      }
      return next;
    });
  };

  const handleTap = (playerKey) => {
    if (matchWinner) {
      return;
    }
    if (phase === "waiting") {
      const winnerKey = playerKey === "p1" ? "p2" : "p1";
      finishRound(winnerKey, null, true);
      return;
    }
    if (phase === "go") {
      const reaction = Date.now() - goTimeRef.current;
      finishRound(playerKey, reaction, false);
    }
  };

  const nextRound = () => {
    if (matchWinner) {
      return;
    }
    setRound((prev) => prev + 1);
    scheduleGo();
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Reaction Duel</p>
          <p className="text-xs text-[var(--ink-soft)]">Round {round}</p>
        </div>
        <button
          type="button"
          onClick={startMatch}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          {phase === "idle" ? "Start" : "Reset"}
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <PlayerScoreCard label={playerOne} score={wins.p1} tone="one" active={phase === "go"} />
        <PlayerScoreCard label={playerTwo} score={wins.p2} tone="two" active={phase === "go"} />
      </div>

      <div className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-3 text-center">
        <p className="text-sm font-semibold text-[var(--ink)]">{message}</p>
        {result ? <p className="mt-1 text-xs text-[var(--ink-soft)]">{result}</p> : null}
        {matchWinner ? (
          <p className="mt-2 text-xs text-[var(--accent)]">{matchWinner} takes the match!</p>
        ) : null}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => handleTap("p1")}
          className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] text-[var(--accent)]"
        >
          <span className="text-xs uppercase tracking-[0.4em]">Tap</span>
          <span className="text-sm font-semibold">{playerOne}</span>
        </button>
        <button
          type="button"
          onClick={() => handleTap("p2")}
          className="flex min-h-[120px] flex-col items-center justify-center gap-2 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] text-[var(--accent-warm)]"
        >
          <span className="text-xs uppercase tracking-[0.4em]">Tap</span>
          <span className="text-sm font-semibold">{playerTwo}</span>
        </button>
      </div>

      {phase === "result" && !matchWinner ? (
        <button
          type="button"
          onClick={nextRound}
          className="w-full rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
        >
          Next round
        </button>
      ) : null}
    </div>
  );
}

function TicTacToeGame({ playerOne, playerTwo }) {
  const emptyBoard = Array.from({ length: 9 }, () => null);
  const [board, setBoard] = useState(emptyBoard);
  const [turn, setTurn] = useState("X");
  const [winner, setWinner] = useState(null);
  const [scores, setScores] = useState({ X: 0, O: 0 });

  const handleMove = (index) => {
    if (winner || board[index]) {
      return;
    }

    const next = [...board];
    next[index] = turn;
    const result = checkTicTacToe(next);

    setBoard(next);

    if (result === "X" || result === "O") {
      setWinner(result);
      setScores((prev) => ({ ...prev, [result]: prev[result] + 1 }));
      return;
    }

    if (result === "draw") {
      setWinner("draw");
      return;
    }

    setTurn((prev) => (prev === "X" ? "O" : "X"));
  };

  const resetBoard = () => {
    setBoard(emptyBoard);
    setWinner(null);
    setTurn("X");
  };

  const statusLabel = winner
    ? winner === "draw"
      ? "Draw round"
      : `${winner === "X" ? playerOne : playerTwo} wins`
    : `${turn === "X" ? playerOne : playerTwo} turn`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Tic Tac Toe</p>
          <p className="text-xs text-[var(--ink-soft)]">{statusLabel}</p>
        </div>
        <button
          type="button"
          onClick={resetBoard}
          className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
        >
          New round
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <PlayerScoreCard label={playerOne} score={scores.X} tone="one" active={turn === "X"} />
        <PlayerScoreCard label={playerTwo} score={scores.O} tone="two" active={turn === "O"} />
      </div>

      <div className="grid grid-cols-3 gap-3">
        {board.map((cell, index) => {
          const cellClass =
            cell === "X"
              ? "text-[var(--accent)]"
              : cell === "O"
              ? "text-[var(--accent-warm)]"
              : "text-[var(--ink-soft)]";
          return (
            <button
              key={`cell-${index}`}
              type="button"
              onClick={() => handleMove(index)}
              className="flex aspect-square items-center justify-center rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] text-2xl font-semibold"
            >
              <span className={cellClass}>{cell || ""}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ConnectFourGame({ playerOne, playerTwo }) {
  const ROWS = 6;
  const COLS = 7;
  const [board, setBoard] = useState(() => createConnectBoard(ROWS, COLS));
  const [current, setCurrent] = useState("R");
  const [winner, setWinner] = useState(null);
  const [scores, setScores] = useState({ R: 0, Y: 0 });

  const handleDrop = (col) => {
    if (winner) {
      return;
    }

    const next = board.map((row) => [...row]);
    let placedRow = -1;

    for (let row = ROWS - 1; row >= 0; row -= 1) {
      if (!next[row][col]) {
        next[row][col] = current;
        placedRow = row;
        break;
      }
    }

    if (placedRow === -1) {
      return;
    }

    const result = checkConnectFour(next);
    setBoard(next);

    if (result === "R" || result === "Y") {
      setWinner(result);
      setScores((prev) => ({ ...prev, [result]: prev[result] + 1 }));
      return;
    }

    if (isConnectBoardFull(next)) {
      setWinner("draw");
      return;
    }

    setCurrent((prev) => (prev === "R" ? "Y" : "R"));
  };

  const resetBoard = () => {
    setBoard(createConnectBoard(ROWS, COLS));
    setCurrent("R");
    setWinner(null);
  };

  const statusLabel = winner
    ? winner === "draw"
      ? "Draw round"
      : `${winner === "R" ? playerOne : playerTwo} wins`
    : `${current === "R" ? playerOne : playerTwo} turn`;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Connect Four</p>
          <p className="text-xs text-[var(--ink-soft)]">{statusLabel}</p>
        </div>
        <button
          type="button"
          onClick={resetBoard}
          className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
        >
          New round
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <PlayerScoreCard label={playerOne} score={scores.R} tone="one" active={current === "R"} />
        <PlayerScoreCard label={playerTwo} score={scores.Y} tone="two" active={current === "Y"} />
      </div>

      <div className="overflow-x-auto">
        <div className="inline-flex gap-2">
          {Array.from({ length: COLS }, (_, col) => (
            <button
              key={`col-${col}`}
              type="button"
              onClick={() => handleDrop(col)}
              className="flex flex-col gap-2 rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-2"
            >
              {board.map((row, rowIndex) => {
                const cell = row[col];
                const tokenClass =
                  cell === "R"
                    ? "bg-[var(--accent)]"
                    : cell === "Y"
                    ? "bg-[var(--accent-warm)]"
                    : "bg-[var(--panel)]";
                return (
                  <span
                    key={`cell-${rowIndex}-${col}`}
                    className={`block h-7 w-7 rounded-full border border-[var(--panel-border)] ${tokenClass}`}
                  />
                );
              })}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

function DiceDuelGame({ playerOne, playerTwo }) {
  const [round, setRound] = useState(1);
  const [rolls, setRolls] = useState({ p1: null, p2: null });
  const [wins, setWins] = useState({ p1: 0, p2: 0 });
  const [result, setResult] = useState("");

  const handleRoll = (playerKey) => {
    if (rolls[playerKey]) {
      return;
    }

    const value = 1 + Math.floor(Math.random() * 6);
    setRolls((prev) => {
      const next = { ...prev, [playerKey]: value };
      if (next.p1 && next.p2) {
        if (next.p1 === next.p2) {
          setResult("Tie round.");
        } else if (next.p1 > next.p2) {
          setWins((winsPrev) => ({ ...winsPrev, p1: winsPrev.p1 + 1 }));
          setResult(`${playerOne} wins the round.`);
        } else {
          setWins((winsPrev) => ({ ...winsPrev, p2: winsPrev.p2 + 1 }));
          setResult(`${playerTwo} wins the round.`);
        }
      }
      return next;
    });
  };

  const nextRound = () => {
    setRound((prev) => prev + 1);
    setRolls({ p1: null, p2: null });
    setResult("");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Dice Duel</p>
          <p className="text-xs text-[var(--ink-soft)]">Round {round}</p>
        </div>
        <button
          type="button"
          onClick={nextRound}
          className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
        >
          Next round
        </button>
      </div>

      <div className="flex flex-col gap-3 sm:flex-row">
        <PlayerScoreCard label={playerOne} score={wins.p1} tone="one" active={false} />
        <PlayerScoreCard label={playerTwo} score={wins.p2} tone="two" active={false} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <div className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-4 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-soft)]">{playerOne}</p>
          <div className="mt-3 text-4xl font-semibold text-[var(--accent)]">
            {rolls.p1 || "-"}
          </div>
          <button
            type="button"
            onClick={() => handleRoll("p1")}
            className="mt-4 w-full rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
          >
            Roll
          </button>
        </div>
        <div className="rounded-3xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-4 text-center">
          <p className="text-xs uppercase tracking-[0.3em] text-[var(--ink-soft)]">{playerTwo}</p>
          <div className="mt-3 text-4xl font-semibold text-[var(--accent-warm)]">
            {rolls.p2 || "-"}
          </div>
          <button
            type="button"
            onClick={() => handleRoll("p2")}
            className="mt-4 w-full rounded-full bg-[var(--accent-warm)] px-4 py-2 text-xs font-semibold text-white"
          >
            Roll
          </button>
        </div>
      </div>

      {result ? <p className="text-center text-xs text-[var(--ink-soft)]">{result}</p> : null}
    </div>
  );
}

function checkTicTacToe(board) {
  const lines = [
    [0, 1, 2],
    [3, 4, 5],
    [6, 7, 8],
    [0, 3, 6],
    [1, 4, 7],
    [2, 5, 8],
    [0, 4, 8],
    [2, 4, 6]
  ];

  for (const [a, b, c] of lines) {
    if (board[a] && board[a] === board[b] && board[a] === board[c]) {
      return board[a];
    }
  }

  if (board.every(Boolean)) {
    return "draw";
  }

  return null;
}

function createConnectBoard(rows, cols) {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => null));
}

function checkConnectFour(board) {
  const rows = board.length;
  const cols = board[0]?.length || 0;
  const directions = [
    { dr: 0, dc: 1 },
    { dr: 1, dc: 0 },
    { dr: 1, dc: 1 },
    { dr: 1, dc: -1 }
  ];

  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = board[row][col];
      if (!cell) {
        continue;
      }

      for (const { dr, dc } of directions) {
        let count = 1;
        let r = row + dr;
        let c = col + dc;

        while (r >= 0 && r < rows && c >= 0 && c < cols && board[r][c] === cell) {
          count += 1;
          if (count >= 4) {
            return cell;
          }
          r += dr;
          c += dc;
        }
      }
    }
  }

  return null;
}

function isConnectBoardFull(board) {
  return board.every((row) => row.every(Boolean));
}
