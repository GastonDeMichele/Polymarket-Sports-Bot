# 🏀👑 Polymarket Sports-Basketball Trading Bot

> Luxury basketball trading terminal for Polymarket.  
> Built for real execution with fast menu flow + independent background monitor.

![Luxury Basketball Arena Background](https://images.unsplash.com/photo-1546519638-68e109498ffc?auto=format&fit=crop&w=1800&q=80)

---

## ✨ What You Get

- 🏀 Modern basketball-themed terminal UI
- 📡 Dedicated background monitoring worker
- ⚡ Goal/score reaction buy flow for selected basketball matches
- 💸 Market order execution (FAK) on Polymarket CLOB
- 🛡 Risk gates: max buy price + max spread
- 📈 Auto take-profit sell engine
- 🧾 Persistent JSON state (settings, positions, trades, selected markets)

---

## 🧠 Architecture

### 1) Main Process (`src/index.ts`)
- Boots credential and allowance checks
- Shows interactive menu
- Saves selected leagues/matches and strategy settings
- Signals worker to reload updated selection

### 2) Monitor Worker (`src/monitor-worker.ts`)
- Runs independently from menu loop
- Watches selected basketball markets
- Triggers BUY logic from sports updates
- Monitors open positions and executes SELL at TP target

---

## 🏀 Supported Basketball Leagues

- `nba` — NBA
- `bkcba` — Chinese Basketball Association (CBA)

Default:

```env
LEAGUES=nba,bkcba
```

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

Copy template:

```bash
cp .env.example .env
```

Set required values:

- `PRIVATE_KEY` — wallet signer private key
- `PROXY_WALLET_ADDRESS` — Polymarket proxy/safe wallet
- `CLOB_API_URL` — usually `https://clob.polymarket.com`
- `CHAIN_ID` — `137` (Polygon mainnet)
- `RPC_URL` and `RPC_TOKEN` — stable low-latency Polygon RPC
- `NEG_RISK=true`
- `LEAGUES=nba,bkcba`

---

## 🎮 How To Use

1. Start bot with `npm start`
2. Open **Select league and live matches** (`🏀`)
3. Choose leagues and mark matches (`SPACE` to select, `ENTER` to save)
4. Open **Current monitoring matches** to verify active watchlist
5. Tune **Settings** for risk/size
6. Keep worker running while matches are live

---

## 📈 Strategy (V1)

### BUY Conditions
- Trigger from live sports update flow on selected basketball events
- Place market FAK order only when:
  - `bestAsk <= maxBuyPrice` (default `0.85`)
  - `spread <= maxSpread` (default `0.10`)

### SELL Conditions
- Worker checks open positions continuously
- Instant market sell when:
  - `currentPrice >= buyPrice + takeProfitDelta`
  - default `takeProfitDelta = 0.15` (absolute)

---

## 🗂 Data & Logs

### Data files
- `data/settings.json`
- `data/selected-markets.json`
- `data/positions.json`
- `data/trades.json`
- `data/credential.json`

### Log files
- `logs/app.log` — runtime + action logs
- `logs/skip.log` — skipped buy reasons

---

## 🏷 Team Marks & Logo Links

- Team codes are shown clearly in logs (`[LAL]`, `[BOS]`, etc.)
- Logo URLs are fetched from Polymarket Teams API when available
- Modern terminals can show clickable logo links (`🖼`)

---

## 🔒 Real Trading Notes

- Start with small size and verify behavior live
- Use reliable RPC and keep latency low
- Never commit `.env` or private keys
- Keep enough USDC and allowance before tip-off

---

## 🚀 V2 Roadmap (Pro Upgrade)

- 🛰 Professional low-latency sports data provider
- 📊 Real-time score momentum and win-probability feeds
- 🤖 ML-based entry confidence engine
- 🎯 Smarter execution to reduce slippage
- 🧯 Advanced risk profile by league/team volatility

---

## 🤝 Contact Dev For Faster Profitable Build

For custom high-performance version (infra + strategy + ML):

- premium sports feed integration
- latency-tuned deployment
- better fill quality and execution engine
- probability-based basket entry model

Add your contact reference:

```env
DEV_CONTACT=your_telegram_or_email
```

---

## 🏁 Restart/Recovery

- On restart, bot reloads persisted JSON state
- Selected monitoring matches stay saved
- Open position tracking resumes automatically
