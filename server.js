
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// ===============================
// TEST MODE
// true  = automatically add 3 bots
// false = normal 4 real players
// ===============================
const TEST_MODE = true;

const io = new Server(server, {
  cors: {
    origin: "https://29online.netlify.app",
    methods: ["GET", "POST"]
  }
});

app.use(express.static(path.join(__dirname, "public")));

app.get("/", (req, res) => {
  res.send("29 Online Backend is running!");
});

const rooms = new Map();

const suits = ["♠", "♥", "♦", "♣"];
const ranks = ["7", "8", "9", "10", "J", "Q", "K", "A"];

function makeDeck() {
  const deck = [];

  for (const suit of suits) {
    for (const rank of ranks) {
      deck.push({
        id: `${rank}${suit}`,
        suit,
        rank
      });
    }
  }

  return deck;
}

function shuffle(array) {
  const a = [...array];

  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }

  return a;
}

function publicRoom(room) {
  return {
    id: room.id,
    started: room.started,

    players: room.players.map((p, i) => ({
      seat: i,
      name: p.name,

      // Bot = online/ready
      connected: p.bot ? true : !!p.socketId,

      bot: !!p.bot
    }))
  };
}

function emitRoom(room) {
  io.to(room.id).emit("room:update", publicRoom(room));
}

function sendGameState(room) {
  room.players.forEach((p, index) => {

    // Bots don't have a socket
    if (!p.socketId) return;

    io.to(p.socketId).emit("game:state", {
      started: room.started,
      seat: index,
      hand: p.hand,
      turn: room.turn,
      trick: room.trick.map(x => ({
        seat: x.seat,
        name: x.name,
        card: x.card
      }))
    });
  });
}

function playBot(room) {
  if (!room || !room.started) return;

  const player = room.players[room.turn];

  if (!player || !player.bot) return;

  if (player.hand.length === 0) {
    room.turn = (room.turn + 1) % 4;
    sendGameState(room);
    playBot(room);
    return;
  }

  // Small delay so the bot looks natural
  setTimeout(() => {

    if (!room.started) return;

    const current = room.players[room.turn];

    if (!current || !current.bot) return;

    const randomIndex = Math.floor(
      Math.random() * current.hand.length
    );

    const card = current.hand.splice(randomIndex, 1)[0];

    room.trick.push({
      seat: room.turn,
      name: current.name,
      card
    });

    room.turn = (room.turn + 1) % 4;

    sendGameState(room);

    // Continue automatically if next player is bot
    playBot(room);

  }, 900);
}

io.on("connection", (socket) => {

  console.log("Player connected:", socket.id);

  // ===============================
  // CREATE ROOM
  // ===============================
  socket.on("createRoom", ({ name }, cb) => {

    let id;

    do {
      id = Math.random()
        .toString(36)
        .slice(2, 7)
        .toUpperCase();
    } while (rooms.has(id));

    const room = {
      id,
      players: [],
      started: false,
      turn: 0,
      deck: [],
      trick: []
    };

    rooms.set(id, room);

    // Real player
    room.players.push({
      name: (name || "Player").slice(0, 20),
      socketId: socket.id,
      hand: [],
      bot: false
    });

    // ===============================
    // TEST MODE: ADD 3 BOTS
    // ===============================
    if (TEST_MODE) {

      const botNames = [
        "Bot 2 🤖",
        "Bot 3 🤖",
        "Bot 4 🤖"
      ];

      botNames.forEach((botName) => {

        room.players.push({
          name: botName,
          socketId: null,
          hand: [],
          bot: true
        });

      });
    }

    socket.join(id);
    socket.data.room = id;

    cb({
      ok: true,
      room: id
    });

    emitRoom(room);
  });

  // ===============================
  // JOIN ROOM
  // ===============================
  socket.on("joinRoom", ({ roomId, name }, cb) => {

    const room = rooms.get(
      String(roomId || "").toUpperCase()
    );

    if (!room) {
      return cb({
        ok: false,
        error: "Room not found"
      });
    }

    if (room.started) {
      return cb({
        ok: false,
        error: "Game already started"
      });
    }

    // In TEST MODE, don't allow extra real players
    // after the 3 bots have filled the room.
    if (room.players.length >= 4) {

      return cb({
        ok: false,
        error: "Room is full"
      });
    }

    room.players.push({
      name: (name || "Player").slice(0, 20),
      socketId: socket.id,
      hand: [],
      bot: false
    });

    socket.join(room.id);
    socket.data.room = room.id;

    cb({
      ok: true,
      room: room.id
    });

    emitRoom(room);
  });

  // ===============================
  // START GAME
  // ===============================
  socket.on("startGame", ({ roomId }, cb) => {

    const room = rooms.get(roomId);

    if (!room) {
      return cb?.({
        ok: false,
        error: "Room not found"
      });
    }

    if (room.players.length !== 4) {
      return cb?.({
        ok: false,
        error: "Exactly 4 players are required"
      });
    }

    // Only creator can start
    if (room.players[0].socketId !== socket.id) {
      return cb?.({
        ok: false,
        error: "Only room creator can start"
      });
    }

    const deck = shuffle(makeDeck());

    room.players.forEach((p) => {
      p.hand = [];
    });

    // Deal 8 cards each
    for (let round = 0; round < 8; round++) {

      room.players.forEach((p) => {
        p.hand.push(deck.shift());
      });

    }

    // Sort cards
    room.players.forEach((p) => {

      p.hand.sort(
        (a, b) =>
          suits.indexOf(a.suit) -
            suits.indexOf(b.suit) ||
          ranks.indexOf(a.rank) -
            ranks.indexOf(b.rank)
      );

    });

    room.deck = deck;
    room.started = true;

    // Creator starts
    room.turn = 0;
    room.trick = [];

    sendGameState(room);

    emitRoom(room);

    cb?.({
      ok: true
    });

    // If first player is bot
    playBot(room);
  });

  // ===============================
  // PLAY CARD
  // ===============================
  socket.on("playCard", ({ roomId, cardId }, cb) => {

    const room = rooms.get(roomId);

    const idx = room
      ? room.players.findIndex(
          (p) => p.socketId === socket.id
        )
      : -1;

    if (!room || idx < 0) {

      return cb?.({
        ok: false,
        error: "Invalid room"
      });
    }

    if (!room.started) {

      return cb?.({
        ok: false,
        error: "Game has not started"
      });
    }

    if (idx !== room.turn) {

      return cb?.({
        ok: false,
        error: "Not your turn"
      });
    }

    const player = room.players[idx];

    const pos = player.hand.findIndex(
      (card) => card.id === cardId
    );

    if (pos < 0) {

      return cb?.({
        ok: false,
        error: "Card not in your hand"
      });
    }

    const card = player.hand.splice(pos, 1)[0];

    room.trick.push({
      seat: idx,
      name: player.name,
      card
    });

    room.turn = (room.turn + 1) % 4;

    sendGameState(room);

    cb?.({
      ok: true
    });

    // Bot automatically plays
    playBot(room);
  });

  // ===============================
  // DISCONNECT
  // ===============================
  socket.on("disconnect", () => {

    console.log(
      "Player disconnected:",
      socket.id
    );

    const id = socket.data.room;

    const room = rooms.get(id);

    if (!room) return;

    const player = room.players.find(
      (p) => p.socketId === socket.id
    );

    if (player) {
      player.socketId = null;
    }

    emitRoom(room);
  });
});

// ===============================
// SERVER
// ===============================

const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `29 game running on port ${PORT}`
  );

  console.log(
    `TEST_MODE = ${TEST_MODE}`
  );
});
