
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const path = require("path");

const app = express();
const server = http.createServer(app);

// Netlify Frontend-এর জন্য CORS
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
        suit,
        rank,
        id: suit + rank
      });
    }
  }

  return deck;
}

function shuffle(a) {
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
      connected: !!p.socketId
    }))
  };
}

function emitRoom(room) {
  io.to(room.id).emit("room:update", publicRoom(room));
}

io.on("connection", (socket) => {

  console.log("Player connected:", socket.id);

  // CREATE ROOM
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

    room.players.push({
      name: (name || "Player").slice(0, 20),
      socketId: socket.id,
      hand: []
    });

    socket.join(id);
    socket.data.room = id;

    cb({
      ok: true,
      room: id
    });

    emitRoom(room);
  });


  // JOIN ROOM
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

    if (room.started || room.players.length >= 4) {
      return cb({
        ok: false,
        error: "Room is full or game already started"
      });
    }

    room.players.push({
      name: (name || "Player").slice(0, 20),
      socketId: socket.id,
      hand: []
    });

    socket.join(room.id);
    socket.data.room = room.id;

    cb({
      ok: true,
      room: room.id
    });

    emitRoom(room);
  });


  // START GAME
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

    // প্রত্যেক player 8টি card পাবে
    for (let round = 0; round < 8; round++) {
      room.players.forEach((p) => {
        p.hand.push(deck.shift());
      });
    }

    room.players.forEach((p) => {
      p.hand.sort(
        (a, b) =>
          suits.indexOf(a.suit) - suits.indexOf(b.suit) ||
          ranks.indexOf(a.rank) - ranks.indexOf(b.rank)
      );
    });

    room.deck = deck;
    room.started = true;
    room.turn = 0;
    room.trick = [];

    room.players.forEach((p) => {

      io.to(p.socketId).emit("game:state", {
        started: true,
        seat: room.players.indexOf(p),
        hand: p.hand,
        turn: room.turn,
        trick: []
      });

    });

    emitRoom(room);

    cb?.({
      ok: true
    });
  });


  // PLAY CARD
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

    const p = room.players[idx];

    const pos = p.hand.findIndex(
      (c) => c.id === cardId
    );

    if (pos < 0) {
      return cb?.({
        ok: false,
        error: "Card not in your hand"
      });
    }

    const card = p.hand.splice(pos, 1)[0];

    room.trick.push({
      seat: idx,
      name: p.name,
      card
    });

    room.turn = (room.turn + 1) % 4;

    room.players.forEach((q) => {

      io.to(q.socketId).emit("game:state", {
        started: true,
        seat: room.players.indexOf(q),
        hand: q.hand,
        turn: room.turn,
        trick: room.trick.map((x) => ({
          seat: x.seat,
          name: x.name,
          card: x.card
        }))
      });

    });

    cb?.({
      ok: true
    });
  });


  // DISCONNECT
  socket.on("disconnect", () => {

    console.log("Player disconnected:", socket.id);

    const id = socket.data.room;
    const room = rooms.get(id);

    if (!room) return;

    const p = room.players.find(
      (x) => x.socketId === socket.id
    );

    if (p) {
      p.socketId = null;
    }

    emitRoom(room);
  });

});


const PORT = process.env.PORT || 3000;

server.listen(PORT, () => {
  console.log(
    `29 game running on port ${PORT}`
  );
});
