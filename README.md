# 29 Online Multiplayer — MVP

এটি ৪-player real-time online 29 card game-এর একটি starter/MVP।
- 32-card deck (7 থেকে A)
- 4 জন room-এ join করতে পারে
- server-side shuffle ও 8টি করে card deal
- real-time turn ও card play
- Socket.IO multiplayer

## চালানোর নিয়ম
1. Node.js 18+ install করুন।
2. এই folder-এ terminal খুলে চালান:
   npm install
   npm start
3. Browser-এ খুলুন:
   http://localhost:3000

## Online hosting
Render/Railway/Fly.io-এর মতো Node hosting-এ deploy করলে বন্ধুদের সঙ্গে online test করা যাবে।
Production-এর জন্য MongoDB Atlas যোগ করে users, rooms, match history ইত্যাদি সংরক্ষণ করা উচিত।

## গুরুত্বপূর্ণ
এটি একটি MVP; পূর্ণ 29 rules (bidding, trump, follow-suit validation, trick winner, partnership score, reconnection, persistent database) পরে যোগ করতে হবে।
কোনো real-money betting/payment feature নেই।
