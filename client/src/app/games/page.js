"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import MessageInput from "../../components/MessageInput";
import MessageList from "../../components/MessageList";
import { createSocket } from "../../socket/client";
import { fetchConversation, fetchMessages } from "../../services/api";

const AUTH_KEY = "flashchat.auth";
const DEFAULT_PEER = {
  id: null,
  name: "Arjun",
  online: false,
  typing: false,
  lastSeen: null
};

const GAMES = [
  {
    id: "tiktok",
    title: "TikTok Toy",
    subtitle: "Reflex test with quick taps",
    status: "Play now"
  },
  {
    id: "emoji",
    title: "Emoji Dash",
    subtitle: "Match the emoji before time runs out",
    status: "Play now"
  },
  {
    id: "dice",
    title: "Love Dice",
    subtitle: "Roll to reveal the vibe",
    status: "Play now"
  },
  {
    id: "word",
    title: "Word Duel",
    subtitle: "Type fast to keep your streak",
    status: "Play now"
  },
  {
    id: "memory",
    title: "Memory Flip",
    subtitle: "Match pairs and clear the board",
    status: "Play now"
  },
  {
    id: "pong",
    title: "Pixel Pong",
    subtitle: "Keep the rally going",
    status: "Play now"
  }
];

export default function GamesPage() {
  const router = useRouter();
  const [auth, setAuth] = useState(null);
  const [messages, setMessages] = useState([]);
  const [peer, setPeer] = useState(DEFAULT_PEER);
  const [status, setStatus] = useState({ connecting: false, connected: false, error: "" });
  const [draft, setDraft] = useState("");
  const [chatOpen, setChatOpen] = useState(false);
  const [activeGameId, setActiveGameId] = useState(GAMES[0]?.id || null);
  const socketRef = useRef(null);
  const typingRef = useRef({ active: false, timeoutId: null });
  const isAdmin = auth?.user?.role === "admin";

  useEffect(() => {
    const stored = localStorage.getItem(AUTH_KEY);
    if (!stored) {
      return;
    }

    try {
      setAuth(JSON.parse(stored));
    } catch {
      localStorage.removeItem(AUTH_KEY);
    }
  }, []);

  useEffect(() => {
    if (!auth?.user) {
      return;
    }

    if (auth.peer) {
      setPeer({
        ...DEFAULT_PEER,
        id: auth.peer.id || null,
        name: auth.peer.name || DEFAULT_PEER.name
      });
      return;
    }

    setPeer((prev) => ({ ...prev, name: DEFAULT_PEER.name }));
  }, [auth]);

  useEffect(() => {
    if (!auth || !auth.roomId) {
      return;
    }

    let ignore = false;

    fetchMessages(auth.token, auth.roomId)
      .then((data) => {
        if (!ignore) {
          const nextMessages = normalizeMessages(data.messages || [], auth.user.id);
          setMessages(nextMessages);
        }
      })
      .catch(() => {});

    return () => {
      ignore = true;
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || isAdmin) {
      return;
    }

    if (auth.roomId && auth.peer) {
      return;
    }

    fetchConversation(auth.token)
      .then((data) => {
        if (!data?.conversation) {
          return;
        }
        const nextAuth = {
          ...auth,
          roomId: data.conversation.id,
          peer: data.peer || auth.peer
        };
        localStorage.setItem(AUTH_KEY, JSON.stringify(nextAuth));
        setAuth(nextAuth);
      })
      .catch(() => {});
  }, [auth]);

  useEffect(() => {
    if (!auth || !auth.roomId) {
      return;
    }

    const socket = createSocket({ token: auth.token, roomId: auth.roomId });
    socketRef.current = socket;
    setStatus((prev) => ({ ...prev, connecting: true, error: "" }));
    socket.connect();

    socket.on("connect", () => {
      setStatus({ connecting: false, connected: true, error: "" });
    });

    socket.on("disconnect", () => {
      setStatus((prev) => ({ ...prev, connected: false }));
    });

    socket.on("receive_message", (message) => {
      setMessages((prev) => upsertMessage(prev, message, auth.user.id));
    });

    socket.on("message_seen", (payload) => {
      if (!payload?.messageIds) {
        return;
      }
      setMessages((prev) => markMessagesSeen(prev, payload.messageIds, payload.seenAt));
    });

    socket.on("message_deleted", (payload) => {
      if (!payload?.messageId) {
        return;
      }
      setMessages((prev) => markMessageDeleted(prev, payload.messageId, payload.deletedBy));
    });

    socket.on("message_edited", (payload) => {
      if (!payload?.message) {
        return;
      }
      setMessages((prev) => upsertMessage(prev, payload.message, auth.user.id));
    });

    socket.on("user_online", (payload) => {
      setPeer((prev) => ({
        ...prev,
        id: payload?.userId || prev.id,
        online: true,
        lastSeen: null
      }));
    });

    socket.on("user_offline", (payload) => {
      setPeer((prev) => ({
        ...prev,
        id: payload?.userId || prev.id,
        online: false,
        typing: false,
        lastSeen: payload?.lastSeen || new Date().toISOString()
      }));
    });

    socket.on("user_typing", (payload) => {
      setPeer((prev) => ({
        ...prev,
        id: payload?.userId || prev.id,
        typing: Boolean(payload?.typing)
      }));
    });

    return () => {
      socket.removeAllListeners();
      socket.disconnect();
      socketRef.current = null;
    };
  }, [auth]);

  useEffect(() => {
    if (!auth || !socketRef.current) {
      return;
    }

    const unseen = messages
      .filter((message) => message.senderId !== auth.user.id && !message.seen)
      .map((message) => message.id)
      .filter(Boolean);

    if (unseen.length === 0) {
      return;
    }

    const seenAt = new Date().toISOString();
    socketRef.current.emit("seen_message", { messageIds: unseen, seenAt });
    setMessages((prev) => markMessagesSeen(prev, unseen, seenAt));
  }, [messages, auth]);

  const handleSend = (text) => {
    if (!auth || !socketRef.current) {
      return;
    }

    const trimmed = text.trim();
    if (!trimmed) {
      return;
    }

    const clientId = makeClientId();
    const optimistic = {
      id: null,
      clientId,
      roomId: auth.roomId,
      senderId: auth.user.id,
      receiverId: null,
      text: trimmed,
      timestamp: new Date().toISOString(),
      seen: false,
      deleted: false,
      edited: false,
      status: "sending"
    };

    setMessages((prev) => [...prev, optimistic]);

    socketRef.current.emit("send_message", { text: trimmed, clientId }, (ack) => {
      if (!ack?.message) {
        return;
      }
      setMessages((prev) => upsertMessage(prev, ack.message, auth.user.id));
    });

    setDraft("");
  };

  const handleTyping = (hasText) => {
    const socket = socketRef.current;
    if (!auth || !socket) {
      return;
    }

    if (hasText && !typingRef.current.active) {
      socket.emit("typing");
      typingRef.current.active = true;
    }

    if (!hasText && typingRef.current.active) {
      socket.emit("stop_typing");
      typingRef.current.active = false;
    }

    if (typingRef.current.timeoutId) {
      clearTimeout(typingRef.current.timeoutId);
    }

    if (hasText) {
      typingRef.current.timeoutId = setTimeout(() => {
        socket.emit("stop_typing");
        typingRef.current.active = false;
      }, 1200);
    }
  };

  const typingPreview = peer.typing ? `${peer.name} is typing...` : "";
  const activeGame = GAMES.find((game) => game.id === activeGameId) || null;

  return (
    <div className="page-shell">
      <div className="flex min-h-screen w-full flex-col bg-[var(--bg)] px-4 py-6">
        <div className="mb-6 flex items-center justify-between">
          <div>
            <p className="text-xs uppercase tracking-[0.4em] text-[var(--accent)]">FlashChat</p>
            <h1 className="mt-2 text-2xl font-semibold text-[var(--ink)]">Games</h1>
            <p className="text-sm text-[var(--ink-soft)]">Multiplayer games for two.</p>
          </div>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="rounded-full border border-[var(--panel-border)] bg-[var(--panel-dark)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
          >
            Back to chat
          </button>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {GAMES.map((game) => {
            const isActive = game.id === activeGameId;
            return (
              <div
                key={game.id}
                className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-4"
              >
                <p className="text-sm font-semibold text-[var(--ink)]">{game.title}</p>
                <p className="mt-1 text-xs text-[var(--ink-soft)]">{game.subtitle}</p>
                <div className="mt-4 flex items-center justify-between">
                  <span className="inline-flex rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1 text-[11px] text-[var(--ink-soft)]">
                    {game.status}
                  </span>
                  <button
                    type="button"
                    onClick={() => setActiveGameId(game.id)}
                    className={`rounded-full px-3 py-1 text-[11px] font-semibold ${
                      isActive
                        ? "bg-[var(--accent)] text-white"
                        : "border border-[var(--panel-border)] text-[var(--ink)]"
                    }`}
                  >
                    {isActive ? "Playing" : "Play"}
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        <div className="mt-6 rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs uppercase tracking-[0.3em] text-[var(--accent)]">
                Active game
              </p>
              <p className="mt-2 text-lg font-semibold text-[var(--ink)]">
                {activeGame ? activeGame.title : "Pick a game"}
              </p>
              <p className="text-xs text-[var(--ink-soft)]">
                {activeGame ? activeGame.subtitle : "Choose a game card to start."}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setActiveGameId(null)}
              className="rounded-full border border-[var(--panel-border)] bg-[var(--panel)] px-3 py-1 text-[11px] text-[var(--ink)]"
            >
              Close
            </button>
          </div>

          <div className="mt-4">
            {activeGameId === "tiktok" ? <TikTokToyGame /> : null}
            {activeGameId === "emoji" ? <EmojiDashGame /> : null}
            {activeGameId === "dice" ? <LoveDiceGame /> : null}
            {activeGameId === "word" ? <WordDuelGame /> : null}
            {activeGameId === "memory" ? <MemoryFlipGame /> : null}
            {activeGameId === "pong" ? <PixelPongGame /> : null}
            {!activeGameId ? (
              <p className="text-sm text-[var(--ink-soft)]">No game selected.</p>
            ) : null}
          </div>
        </div>

        <button
          type="button"
          onClick={() => setChatOpen((prev) => !prev)}
          className="fixed bottom-6 right-6 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-[var(--accent)] text-white shadow-glow"
          aria-label="Chat"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5 fill-current" aria-hidden="true">
            <path d="M4 4h16a2 2 0 0 1 2 2v9a2 2 0 0 1-2 2H8l-4 4V6a2 2 0 0 1 2-2z" />
          </svg>
        </button>

        {chatOpen ? (
          <div className="fixed bottom-20 right-4 z-40 flex w-[320px] max-w-[90vw] flex-col overflow-hidden rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] shadow-glow">
            <div className="flex items-center justify-between border-b border-[var(--panel-border)] bg-[var(--panel)] px-3 py-2">
              <div>
                <p className="text-sm font-semibold text-[var(--ink)]">{peer.name}</p>
                <p className="text-xs text-[var(--ink-soft)]">
                  {status.connected ? "online" : status.connecting ? "connecting" : "offline"}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setChatOpen(false)}
                className="text-lg text-[var(--ink-soft)]"
                aria-label="Close chat"
              >
                ×
              </button>
            </div>
            <div className="chat-scroll max-h-[280px] overflow-y-auto px-3 py-3">
              <MessageList messages={messages} currentUserId={auth?.user?.id || ""} />
            </div>
            <div className="border-t border-[var(--panel-border)] bg-[var(--panel)] px-2 py-2">
              <MessageInput
                disabled={!status.connected}
                value={draft}
                onValueChange={setDraft}
                onSend={handleSend}
                onTyping={handleTyping}
                replyTarget={null}
                editingMessage={null}
                typingPreview={typingPreview}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function makeClientId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `client-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeMessages(list, currentUserId) {
  return list.map((message) => ({
    ...message,
    deleted: Boolean(message.deleted),
    edited: Boolean(message.edited),
    seenAt: message.seenAt || null,
    status: resolveStatus(message, currentUserId)
  }));
}

function resolveStatus(message, currentUserId) {
  if (message.deleted) {
    return "deleted";
  }
  if (message.senderId === currentUserId) {
    if (message.seen) {
      return "seen";
    }
    return "delivered";
  }
  return "received";
}

function upsertMessage(list, message, currentUserId) {
  const nextStatus = resolveStatus(message, currentUserId);
  const nextMessage = { ...message, status: nextStatus };

  const index = list.findIndex((item) =>
    item.id ? item.id === nextMessage.id : item.clientId && item.clientId === nextMessage.clientId
  );

  if (index === -1) {
    return [...list, nextMessage];
  }

  const updated = [...list];
  updated[index] = { ...updated[index], ...nextMessage };
  return updated;
}

function markMessagesSeen(list, ids, seenAt) {
  if (!ids || ids.length === 0) {
    return list;
  }

  return list.map((message) =>
    ids.includes(message.id)
      ? { ...message, seen: true, seenAt: seenAt || message.seenAt, status: "seen" }
      : message
  );
}

function markMessageDeleted(list, messageId, deletedBy) {
  return list.map((message) =>
    message.id === messageId
      ? { ...message, deleted: true, deletedBy, status: "deleted" }
      : message
  );
}

const EMOJI_SET = [
  "😀",
  "😂",
  "😍",
  "😎",
  "😭",
  "🥺",
  "🔥",
  "🎉",
  "💎",
  "🍀",
  "🌈",
  "⚡",
  "⭐",
  "🍒",
  "🍉",
  "🥑",
  "🍣",
  "🎯",
  "🎲",
  "🎹",
  "🎮",
  "🏆"
];

const WORDS = [
  "spark",
  "glow",
  "friend",
  "comet",
  "vibe",
  "swift",
  "signal",
  "pixel",
  "memory",
  "arrow",
  "focus",
  "ripple",
  "chase",
  "puzzle",
  "lucky",
  "tempo",
  "bright",
  "strike"
];

const MEMORY_ICONS = ["🍒", "🍋", "🍇", "🍉", "⭐", "💎", "🍀", "🎵"];

function TikTokToyGame() {
  const TOTAL_ROUNDS = 8;
  const [running, setRunning] = useState(false);
  const [ready, setReady] = useState(false);
  const [round, setRound] = useState(0);
  const [reactionTimes, setReactionTimes] = useState([]);
  const [message, setMessage] = useState("Tap start to begin.");
  const startRef = useRef(0);
  const timerRef = useRef(null);

  const best = reactionTimes.length ? Math.min(...reactionTimes) : null;
  const average = reactionTimes.length
    ? Math.round(reactionTimes.reduce((total, value) => total + value, 0) / reactionTimes.length)
    : null;

  const scheduleNext = () => {
    setReady(false);
    setMessage("Wait for the pulse...");
    if (timerRef.current) {
      clearTimeout(timerRef.current);
    }
    timerRef.current = setTimeout(() => {
      setReady(true);
      startRef.current = Date.now();
      setMessage("Tap now!");
    }, 600 + Math.random() * 1400);
  };

  const startGame = () => {
    setRunning(true);
    setRound(0);
    setReactionTimes([]);
    scheduleNext();
  };

  const handleTap = () => {
    if (!running) {
      return;
    }
    if (!ready) {
      setMessage("Too soon. Wait for the pulse.");
      return;
    }

    const reaction = Date.now() - startRef.current;
    const nextTimes = [...reactionTimes, reaction];
    const nextRound = round + 1;

    setReactionTimes(nextTimes);
    setRound(nextRound);

    if (nextRound >= TOTAL_ROUNDS) {
      setRunning(false);
      setReady(false);
      const avg = Math.round(
        nextTimes.reduce((total, value) => total + value, 0) / nextTimes.length
      );
      setMessage(`Done! Avg ${avg}ms`);
      return;
    }

    scheduleNext();
  };

  useEffect(() => {
    return () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
      }
    };
  }, []);

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Reflex Run</p>
          <p className="text-xs text-[var(--ink-soft)]">Round {round} / {TOTAL_ROUNDS}</p>
        </div>
        <button
          type="button"
          onClick={startGame}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          {running ? "Restart" : "Start"}
        </button>
      </div>
      <div className="mt-4 flex items-center justify-between gap-3 text-xs text-[var(--ink-soft)]">
        <span>Best: {best ? `${best}ms` : "-"}</span>
        <span>Avg: {average ? `${average}ms` : "-"}</span>
      </div>
      <div className="mt-4 flex flex-col items-center gap-3">
        <button
          type="button"
          onClick={handleTap}
          className={`flex h-24 w-24 items-center justify-center rounded-full text-xs font-semibold transition ${
            ready ? "bg-[var(--accent)] text-white" : "bg-[var(--panel-dark)] text-[var(--ink-soft)]"
          }`}
        >
          {ready ? "Tap" : "Wait"}
        </button>
        <p className="text-xs text-[var(--ink-soft)]">{message}</p>
      </div>
    </div>
  );
}

function EmojiDashGame() {
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(30);
  const [score, setScore] = useState(0);
  const [target, setTarget] = useState("");
  const [options, setOptions] = useState([]);

  const nextRound = () => {
    const targetEmoji = EMOJI_SET[Math.floor(Math.random() * EMOJI_SET.length)];
    const choices = new Set([targetEmoji]);
    while (choices.size < 4) {
      choices.add(EMOJI_SET[Math.floor(Math.random() * EMOJI_SET.length)]);
    }
    setTarget(targetEmoji);
    setOptions(shuffleArray(Array.from(choices)));
  };

  useEffect(() => {
    if (!running) {
      return;
    }

    if (timeLeft <= 0) {
      setRunning(false);
      return;
    }

    const timer = setTimeout(() => {
      setTimeLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [running, timeLeft]);

  const handleStart = () => {
    setScore(0);
    setTimeLeft(30);
    setRunning(true);
    nextRound();
  };

  const handlePick = (emoji) => {
    if (!running) {
      return;
    }
    if (emoji === target) {
      setScore((prev) => prev + 1);
    } else {
      setScore((prev) => Math.max(0, prev - 1));
    }
    nextRound();
  };

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Emoji Dash</p>
          <p className="text-xs text-[var(--ink-soft)]">Time: {timeLeft}s • Score: {score}</p>
        </div>
        <button
          type="button"
          onClick={handleStart}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          {running ? "Restart" : "Start"}
        </button>
      </div>
      <div className="mt-4 text-center">
        <p className="text-xs text-[var(--ink-soft)]">Find this emoji</p>
        <div className="mt-2 text-3xl">{target || "❔"}</div>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3">
        {options.map((emoji) => (
          <button
            key={emoji}
            type="button"
            onClick={() => handlePick(emoji)}
            className="flex items-center justify-center rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] py-4 text-2xl"
          >
            {emoji}
          </button>
        ))}
      </div>
      {!running && timeLeft === 0 ? (
        <p className="mt-3 text-center text-xs text-[var(--ink-soft)]">Time's up!</p>
      ) : null}
    </div>
  );
}

function LoveDiceGame() {
  const [dice, setDice] = useState([1, 1]);
  const [message, setMessage] = useState("Roll the dice to see the vibe.");

  const rollDice = () => {
    const first = 1 + Math.floor(Math.random() * 6);
    const second = 1 + Math.floor(Math.random() * 6);
    const total = first + second;
    let nextMessage = "Soft sparks today.";

    if (total === 12) {
      nextMessage = "Perfect match energy!";
    } else if (total >= 10) {
      nextMessage = "Big love vibes!";
    } else if (total >= 7) {
      nextMessage = "Sweet connection.";
    }

    setDice([first, second]);
    setMessage(nextMessage);
  };

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
      <div className="flex items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Love Dice</p>
          <p className="text-xs text-[var(--ink-soft)]">Roll and share the mood.</p>
        </div>
        <button
          type="button"
          onClick={rollDice}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          Roll
        </button>
      </div>
      <div className="mt-4 flex items-center justify-center gap-4">
        {dice.map((value, index) => (
          <div
            key={`dice-${index}`}
            className="flex h-14 w-14 items-center justify-center rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] text-xl font-semibold text-[var(--ink)]"
          >
            {value}
          </div>
        ))}
      </div>
      <p className="mt-3 text-center text-xs text-[var(--ink-soft)]">{message}</p>
    </div>
  );
}

function WordDuelGame() {
  const [running, setRunning] = useState(false);
  const [timeLeft, setTimeLeft] = useState(10);
  const [word, setWord] = useState(WORDS[0]);
  const [input, setInput] = useState("");
  const [streak, setStreak] = useState(0);
  const [best, setBest] = useState(0);
  const [message, setMessage] = useState("Type the word to score.");

  useEffect(() => {
    if (!running) {
      return;
    }

    if (timeLeft <= 0) {
      setRunning(false);
      setStreak(0);
      setMessage("Time's up. Try again!");
      return;
    }

    const timer = setTimeout(() => setTimeLeft((prev) => prev - 1), 1000);
    return () => clearTimeout(timer);
  }, [running, timeLeft]);

  const startGame = () => {
    setRunning(true);
    setTimeLeft(10);
    setInput("");
    setStreak(0);
    setMessage("Go!");
    setWord(randomFromList(WORDS));
  };

  const handleInput = (event) => {
    const value = event.target.value;
    setInput(value);

    if (value.trim().toLowerCase() === word.toLowerCase()) {
      const nextStreak = streak + 1;
      setStreak(nextStreak);
      setBest((prev) => Math.max(prev, nextStreak));
      setInput("");
      setTimeLeft(10);
      setWord(randomFromList(WORDS));
      setMessage("Nice! Keep going.");
    }
  };

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Word Duel</p>
          <p className="text-xs text-[var(--ink-soft)]">Time: {timeLeft}s</p>
        </div>
        <button
          type="button"
          onClick={startGame}
          className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
        >
          {running ? "Restart" : "Start"}
        </button>
      </div>
      <div className="mt-4 text-center">
        <p className="text-xs text-[var(--ink-soft)]">Type this word</p>
        <p className="mt-2 text-2xl font-semibold text-[var(--ink)]">{word}</p>
      </div>
      <input
        value={input}
        onChange={handleInput}
        disabled={!running}
        placeholder="Start typing"
        className="mt-4 w-full rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)] px-3 py-2 text-sm text-[var(--ink)]"
      />
      <div className="mt-3 flex items-center justify-between text-xs text-[var(--ink-soft)]">
        <span>Streak: {streak}</span>
        <span>Best: {best}</span>
      </div>
      <p className="mt-2 text-xs text-[var(--ink-soft)]">{message}</p>
    </div>
  );
}

function MemoryFlipGame() {
  const [cards, setCards] = useState(() => buildMemoryDeck());
  const [flippedIds, setFlippedIds] = useState([]);
  const [moves, setMoves] = useState(0);
  const [matches, setMatches] = useState(0);
  const timeoutRef = useRef(null);
  const lockRef = useRef(false);

  const resetGame = () => {
    setCards(buildMemoryDeck());
    setFlippedIds([]);
    setMoves(0);
    setMatches(0);
    lockRef.current = false;
  };

  useEffect(() => {
    if (flippedIds.length !== 2) {
      return;
    }

    const [firstId, secondId] = flippedIds;
    const firstCard = cards.find((card) => card.id === firstId);
    const secondCard = cards.find((card) => card.id === secondId);

    if (!firstCard || !secondCard) {
      return;
    }

    setMoves((prev) => prev + 1);

    if (firstCard.emoji === secondCard.emoji) {
      setCards((prev) =>
        prev.map((card) =>
          card.id === firstId || card.id === secondId
            ? { ...card, matched: true }
            : card
        )
      );
      setMatches((prev) => prev + 1);
      setFlippedIds([]);
      return;
    }

    lockRef.current = true;
    timeoutRef.current = setTimeout(() => {
      setCards((prev) =>
        prev.map((card) =>
          card.id === firstId || card.id === secondId
            ? { ...card, flipped: false }
            : card
        )
      );
      setFlippedIds([]);
      lockRef.current = false;
    }, 700);
  }, [flippedIds, cards]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleFlip = (card) => {
    if (lockRef.current || card.flipped || card.matched || flippedIds.length >= 2) {
      return;
    }

    setCards((prev) =>
      prev.map((item) =>
        item.id === card.id ? { ...item, flipped: true } : item
      )
    );
    setFlippedIds((prev) => [...prev, card.id]);
  };

  const completed = matches === MEMORY_ICONS.length;

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Memory Flip</p>
          <p className="text-xs text-[var(--ink-soft)]">Moves: {moves}</p>
        </div>
        <button
          type="button"
          onClick={resetGame}
          className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-xs font-semibold text-[var(--ink)]"
        >
          Reset
        </button>
      </div>
      <div className="mt-4 grid grid-cols-4 gap-2">
        {cards.map((card) => (
          <button
            key={card.id}
            type="button"
            onClick={() => handleFlip(card)}
            className={`flex h-14 items-center justify-center rounded-xl border border-[var(--panel-border)] text-xl ${
              card.flipped || card.matched
                ? "bg-[var(--panel-dark)]"
                : "bg-[var(--panel)] text-[var(--ink-soft)]"
            }`}
          >
            {card.flipped || card.matched ? card.emoji : "?"}
          </button>
        ))}
      </div>
      {completed ? (
        <p className="mt-3 text-center text-xs text-[var(--ink-soft)]">
          You cleared the board!
        </p>
      ) : null}
    </div>
  );
}

function PixelPongGame() {
  const WIDTH = 320;
  const HEIGHT = 180;
  const PADDLE_WIDTH = 64;
  const PADDLE_HEIGHT = 8;
  const BALL_RADIUS = 5;
  const canvasRef = useRef(null);
  const frameRef = useRef(null);
  const keysRef = useRef({ left: false, right: false });
  const ballRef = useRef({ x: WIDTH / 2, y: HEIGHT / 2, vx: 2.4, vy: -2.4 });
  const paddleRef = useRef({ x: (WIDTH - PADDLE_WIDTH) / 2 });
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(3);
  const [message, setMessage] = useState("Press start to play.");
  const runningRef = useRef(false);

  const resetBall = () => {
    ballRef.current = {
      x: WIDTH / 2,
      y: HEIGHT / 2,
      vx: 2.4 * (Math.random() > 0.5 ? 1 : -1),
      vy: -2.4
    };
  };

  const resetGame = () => {
    setScore(0);
    setLives(3);
    setMessage("Press start to play.");
    resetBall();
  };

  const drawScene = (ctx) => {
    ctx.clearRect(0, 0, WIDTH, HEIGHT);
    ctx.fillStyle = "rgba(15, 23, 42, 0.35)";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const paddleX = paddleRef.current.x;
    ctx.fillStyle = "#00a884";
    ctx.fillRect(paddleX, HEIGHT - PADDLE_HEIGHT - 6, PADDLE_WIDTH, PADDLE_HEIGHT);

    const ball = ballRef.current;
    ctx.beginPath();
    ctx.fillStyle = "#e9edef";
    ctx.arc(ball.x, ball.y, BALL_RADIUS, 0, Math.PI * 2);
    ctx.fill();
  };

  const step = () => {
    if (!runningRef.current) {
      return;
    }

    const ball = ballRef.current;
    const paddleX = paddleRef.current.x;

    if (keysRef.current.left) {
      paddleRef.current.x = Math.max(0, paddleX - 4);
    }
    if (keysRef.current.right) {
      paddleRef.current.x = Math.min(WIDTH - PADDLE_WIDTH, paddleX + 4);
    }

    ball.x += ball.vx;
    ball.y += ball.vy;

    if (ball.x <= BALL_RADIUS || ball.x >= WIDTH - BALL_RADIUS) {
      ball.vx *= -1;
    }
    if (ball.y <= BALL_RADIUS) {
      ball.vy *= -1;
    }

    const paddleTop = HEIGHT - PADDLE_HEIGHT - 6;
    if (
      ball.y + BALL_RADIUS >= paddleTop &&
      ball.y + BALL_RADIUS <= paddleTop + PADDLE_HEIGHT &&
      ball.x >= paddleX &&
      ball.x <= paddleX + PADDLE_WIDTH
    ) {
      ball.vy *= -1;
      setScore((prev) => prev + 1);
    }

    if (ball.y > HEIGHT + BALL_RADIUS) {
      setLives((prev) => {
        const next = prev - 1;
        if (next <= 0) {
          runningRef.current = false;
          setRunning(false);
          setMessage("Game over. Try again!");
        }
        return Math.max(next, 0);
      });
      resetBall();
    }

    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      drawScene(ctx);
    }

    frameRef.current = requestAnimationFrame(step);
  };

  useEffect(() => {
    const handleKeyDown = (event) => {
      if (event.key === "ArrowLeft") {
        keysRef.current.left = true;
      }
      if (event.key === "ArrowRight") {
        keysRef.current.right = true;
      }
    };

    const handleKeyUp = (event) => {
      if (event.key === "ArrowLeft") {
        keysRef.current.left = false;
      }
      if (event.key === "ArrowRight") {
        keysRef.current.right = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, []);

  useEffect(() => {
    runningRef.current = running;
    if (running) {
      setMessage("Keep it going!");
      frameRef.current = requestAnimationFrame(step);
    } else {
      const ctx = canvasRef.current?.getContext("2d");
      if (ctx) {
        drawScene(ctx);
      }
    }

    return () => {
      if (frameRef.current) {
        cancelAnimationFrame(frameRef.current);
      }
    };
  }, [running]);

  const handleStart = () => {
    if (lives <= 0) {
      resetGame();
    }
    setRunning(true);
  };

  const handlePause = () => {
    setRunning(false);
    setMessage("Paused.");
  };

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const x = event.clientX - rect.left;
    paddleRef.current.x = Math.min(Math.max(x - PADDLE_WIDTH / 2, 0), WIDTH - PADDLE_WIDTH);
  };

  const handleTouchMove = (event) => {
    const touch = event.touches[0];
    if (!touch) {
      return;
    }
    const rect = event.currentTarget.getBoundingClientRect();
    const x = touch.clientX - rect.left;
    paddleRef.current.x = Math.min(Math.max(x - PADDLE_WIDTH / 2, 0), WIDTH - PADDLE_WIDTH);
  };

  return (
    <div className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel)] p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm font-semibold text-[var(--ink)]">Pixel Pong</p>
          <p className="text-xs text-[var(--ink-soft)]">Score: {score} • Lives: {lives}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleStart}
            className="rounded-full bg-[var(--accent)] px-4 py-2 text-xs font-semibold text-white"
          >
            Start
          </button>
          <button
            type="button"
            onClick={handlePause}
            className="rounded-full border border-[var(--panel-border)] px-4 py-2 text-xs text-[var(--ink)]"
          >
            Pause
          </button>
        </div>
      </div>
      <div className="mt-4 flex flex-col items-center gap-2">
        <canvas
          ref={canvasRef}
          width={WIDTH}
          height={HEIGHT}
          onMouseMove={handlePointerMove}
          onTouchMove={handleTouchMove}
          className="rounded-2xl border border-[var(--panel-border)] bg-[var(--panel-dark)]"
        />
        <p className="text-xs text-[var(--ink-soft)]">{message}</p>
      </div>
    </div>
  );
}

function buildMemoryDeck() {
  const pairs = MEMORY_ICONS.flatMap((emoji, index) => [
    { id: `m-${index}-a`, emoji, flipped: false, matched: false },
    { id: `m-${index}-b`, emoji, flipped: false, matched: false }
  ]);
  return shuffleArray(pairs);
}

function shuffleArray(list) {
  const next = [...list];
  for (let i = next.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [next[i], next[j]] = [next[j], next[i]];
  }
  return next;
}

function randomFromList(list) {
  return list[Math.floor(Math.random() * list.length)];
}
