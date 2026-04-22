# 🎾👑 Polymarket Sports-Tennis Trading Bot

> Luxury tennis trading terminal for Polymarket.  
> Real execution workflow with separate monitor worker + persistent state.

![Luxury Tennis Court Background](https://images.unsplash.com/photo-1622279457486-28f57f6f8f3b?auto=format&fit=crop&w=1800&q=80)

---

## ✨ Features

- 🎾 Tennis-themed terminal menu and logger
- 📡 Independent background monitor process
- ⚡ Live sports update reaction for selected tennis matches
- 💸 FAK market order execution on Polymarket CLOB
- 🛡 Buy guards (`maxBuyPrice`, `maxSpread`)
- 📈 Auto take-profit selling (`buyPrice + takeProfitDelta`)
- 🧾 JSON persistence for settings, selection, positions, and trades

---

## 🎾 Supported Tennis Leagues

- `atp` — ATP Tour
- `wta` — WTA Tour

Default:

```env
LEAGUES=atp,wta
```

---

## 🧠 Runtime Model

### Main process (`src/index.ts`)
- boots credentials and allowance checks
- runs interactive menu
- saves selected markets/settings
- notifies monitor worker to reload selection

### Monitor worker (`src/monitor-worker.ts`)
- runs independently from UI
- consumes selected tennis events only
- triggers buy path on live updates
- manages sell loop for take-profit exits

---

## ⚙️ Install & Run

```bash
npm install
npm run build
npm start
```

Dev mode:

```bash
npm run dev
```

---

## 🔧 Environment

Copy template:

```bash
cp .env.example .env
```

Required fields:

- `PRIVATE_KEY`
- `PROXY_WALLET_ADDRESS`
- `CLOB_API_URL=https://clob.polymarket.com`
- `CHAIN_ID=137`
- `RPC_URL`, `RPC_TOKEN`
- `NEG_RISK=true`
- `LEAGUES=atp,wta`

---

## 🎮 Usage

1. Start bot (`npm start`)
2. Open **Select league and live matches** (`🎾`)
3. Choose ATP/WTA and select matches (`SPACE` + `ENTER`)
4. Verify list in **Current monitoring matches**
5. Tune risk/size in **Settings**
6. Keep monitor running during live play

---

## 📈 Strategy (V1)

### Buy
- trigger from live sports update path
- skip buy if:
  - `bestAsk > maxBuyPrice` (default `0.85`)
  - `spread > maxSpread` (default `0.10`)

### Sell
- monitor open positions in background
- execute sell when:
  - `bestBid >= buyPrice + takeProfitDelta`
  - default delta: `0.15`

---

## 🗂 Data & Logs

Data:
- `data/settings.json`
- `data/selected-markets.json`
- `data/positions.json`
- `data/trades.json`
- `data/credential.json`

Logs:
- `logs/app.log`
- `logs/skip.log`

---

## 🚀 V2 Roadmap

- premium low-latency tennis feed
- point/game momentum probabilities
- ML-based entry confidence scoring
- execution optimization for better fills
- advanced per-tournament risk tuning

---

## 🤝 Custom Upgrade Contact

```env
DEV_CONTACT=your_telegram_or_email
```

---

## 🏁 Recovery

- state is loaded from persisted JSON files on restart
- selected matches and positions are retained
- monitor resumes with latest saved state
