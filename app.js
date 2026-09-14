const socket = io("https://four-player-online-29-card.onrender.com");

const $ = (id) => document.getElementById(id);

let roomId = null;

function msg(text) {
  $("msg").textContent = text || "";
}

function roomMsg(text) {
  $("roomMsg").textContent = text || "";
}

socket.on("connect", () => {
  msg("✅ Server connected");
});

socket.on("connect_error", () => {
  msg("❌ Server connection failed");
});

socket.on("room:update", (room) => {
  roomId = room.id;

  $("lobby").classList.add("hidden");
  $("roomView").classList.remove("hidden");

  $("roomCode").textContent = room.id;

  $("players").innerHTML = room.players
    .map((p, i) =>
      `<div class="player">
        ${i + 1}. ${escapeHtml(p.name)}
        ${p.connected ? " 🟢" : " ⚪"}
      </div>`
    )
    .join("");

  if (room.players.length === 4) {
    roomMsg("✅ ৪ জন player ready — Start চাপুন।");
  } else {
    roomMsg(`${room.players.length}/4 player joined`);
  }
});

$("create").onclick = () => {
  const name = $("name").value.trim() || "Player";

  socket.emit("createRoom", { name }, (res) => {
    if (!res || !res.ok) {
      msg(res?.error || "Room তৈরি করা যায়নি");
      return;
    }

    roomId = res.room;
    msg("Room created: " + roomId);
  });
};

$("join").onclick = () => {
  const name = $("name").value.trim() || "Player";
  const code = $("room").value.trim().toUpperCase();

  if (!code) {
    msg("Room code দিন");
    return;
  }

  socket.emit(
    "joinRoom",
    {
      roomId: code,
      name
    },
    (res) => {
      if (!res || !res.ok) {
        msg(res?.error || "Room join করা যায়নি");
        return;
      }

      roomId = res.room;
      msg("Joined room: " + roomId);
    }
  );
};

$("start").onclick = () => {
  if (!roomId) return;

  socket.emit("startGame", { roomId }, (res) => {
    if (!res || !res.ok) {
      roomMsg(res?.error || "Game start হয়নি");
    }
  });
};

socket.on("game:state", (state) => {
  $("roomView").classList.add("hidden");
  $("game").classList.remove("hidden");

  $("seat").textContent = `Seat: ${state.seat + 1}`;
  $("turn").textContent =
    state.turn === state.seat
      ? "🎯 তোমার turn"
      : `Player ${state.turn + 1}'s turn`;

  renderHand(state.hand || []);
  renderTable(state.trick || []);
});

function renderHand(hand) {
  $("hand").innerHTML = "";

  hand.forEach((card) => {
    const button = document.createElement("button");

    button.className = "card";
    button.textContent = `${card.rank}${card.suit}`;

    button.onclick = () => {
      socket.emit(
        "playCard",
        {
          roomId,
          cardId: card.id
        },
        (res) => {
          if (!res || !res.ok) {
            console.log(res?.error || "Card play failed");
          }
        }
      );
    };

    $("hand").appendChild(button);
  });
}

function renderTable(trick) {
  $("table").innerHTML = trick
    .map(
      (x) =>
        `<div class="played">
          Player ${x.seat + 1}: 
          <b>${x.card.rank}${x.card.suit}</b>
        </div>`
    )
    .join("");
}

function escapeHtml(text) {
  return String(text)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
