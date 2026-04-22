# ⚽🏆 Polymarket Sports-Football Trading Bot

> A premium, football-style trading bot for Polymarket markets.  
> Built for speed, clean UI, and real execution workflow.

---

## 🌟 What This Bot Does

- 🎛 **Luxury terminal UI** with football-themed menu flow
- 📡 **Background monitor service** (separate process)
- ⚡ **Goal-reaction buy logic** via sports updates
- 💸 **Market order execution** (FAK) on Polymarket CLOB
- 🧾 **Persistent state** in JSON (positions, trades, selected matches)
- 📘 **Structured logs** with team marks, icons, and skip reasons

---

## 🧠 Runtime Architecture

### 1) Main Process (UI + Setup)
Command: `npm start` (or `npm run dev`)

Responsibilities:
- 🔐 Create/refresh API credentials
- ✅ Check allowance and trading readiness
- 🧭 Show menus:
  1. `Bought matches / open positions`
  2. `Select league and live matches`
  3. `Current monitoring matches`
  4. `Settings`

### 2) Monitor Worker (Background Service)
File: `src/monitor-worker.ts` (spawned automatically)

Responsibilities:
- 📥 Read `data/selected-markets.json`
- 🎯 Watch score updates / selected events
- 💰 Place BUY orders after trigger + risk filters
- 🛡 Monitor open positions and SELL on TP condition

---

## ⚙️ Installation

```bash
npm install
npm run build
npm start
```

Development mode:

```bash
npm run dev
```

---

## 🔧 Environment Setup

Create `.env` from `.env.example`:

```bash
cp .env.example .env
```

Set required values:

- `PRIVATE_KEY` — signer private key used for API + orders
- `PROXY_WALLET_ADDRESS` — Polymarket proxy/safe wallet
- `CLOB_API_URL` — usually `https://clob.polymarket.com`
- `CHAIN_ID` — `137` for Polygon mainnet
- `RPC_URL` / `RPC_TOKEN` — Polygon RPC access
- `NEG_RISK=true` — required for sports moneyline flow
- `LEAGUES=epl,elc,laliga,ligue-1,bundesliga,ucl`

---

## 🎮 How To Use

### Step 1: Start bot
Run `npm start`.

### Step 2: Select league & matches
- Open menu **“Select league and live matches”**
- Choose league (with cup icons 🏆🥇🥈 etc.)
- Select live/upcoming matches (date-sorted)
- Bot saves to `data/selected-markets.json`

### Step 3: Monitor automatically
- Open menu **“Current monitoring matches”** to review active list
- Monitor service runs in background and uses selected matches only

### Step 4: Tune settings
Use menu **“Settings”** to update:
- buy amount
- max buy price
- max spread
- take-profit delta
- monitor polling speed

---

## 📈 Current Strategy (V1)

### BUY logic
- Uses **market FAK order**
- Triggered on selected event/score flow
- Skips BUY when:
  - `bestAsk > maxBuyPrice` (default `0.85`)
  - `spread > maxSpread` (default `0.10`)

### SELL logic
- Background worker monitors open positions
- Sells instantly when:
  - `currentPrice >= buyPrice + takeProfitDelta`
  - default TP delta = `+0.15` absolute

---

## 🗂 Data & Logs

### Data files
- `data/settings.json` — strategy parameters
- `data/selected-markets.json` — active selected matches
- `data/positions.json` — open/closed positions
- `data/trades.json` — trade history
- `data/credential.json` — derived API key credential

### Log files
- `logs/app.log` — runtime logs
- `logs/skip.log` — skipped buy reasons

---

## 🏟 Team Marks / Logos

- Terminal uses **team marks** (`[RMA]`, `[ARS]`, etc.) for readability.
- Where available, team logo URLs are sourced from Polymarket Teams API.
- In modern terminals, logo links may be clickable.

---

## 🔒 Notes for Real Trading

- Start with small size.
- Confirm allowance and wallet funding before matches.
- Keep RPC stable and low-latency.
- Never expose `.env` secrets.

---

## 🚀 V2 Roadmap (Professional Upgrade)

For higher speed and profitability, V2 will include:

- 🛰 Professional real-time sports data API integration
- 🧮 Goal probability / momentum percentages
- 🤖 ML-based entry scoring and confidence engine
- 📊 Better execution modeling and slippage handling
- 📉 Advanced risk module per league/team volatility

---

## 🤝 Contact Dev (Performance Upgrade)

If you want a **faster and more profitable custom version**, contact dev for:

- low-latency infra tuning
- premium sports feed integration
- exchange-grade execution logic
- ML strategy module (V2)

Add your contact line here:

`DEV_CONTACT=your_telegram_or_email`

---

## 🏁 Recovery Behavior

- On restart, bot loads saved JSON state.
- Selected matches and positions persist.
- Monitor resumes from persisted state and current market data.
