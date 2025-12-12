# Shining Crown Slot Game

A modern slot game built with Next.js 15, PIXI.js 8, and PIXI React.

## Tech Stack

- **Framework**: Next.js 15.4.4 with App Router
- **Rendering**: PIXI.js 8.11.0 + @pixi/react 8.0.5
- **Language**: TypeScript
- **Styling**: Tailwind CSS 4
- **Sound**: @pixi/sound 6.0.1
- **State Management**: React 19 Hooks

## Architecture

The game uses a **hybrid declarative/imperative architecture**:
- **Declarative (PIXI React)**: Scene structure, UI elements, visual layout
- **Imperative (vanilla PIXI)**: 60fps animations, win sequences, ticker-based control

See [PIXI_REACT_SUMMARY.md](PIXI_REACT_SUMMARY.md) for details.

## Getting Started

### Prerequisites
- Node.js 18+
- npm or pnpm

### Installation

```bash
npm install
```

### Development

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) to play the game.

### Production Build

```bash
npm run build
npm start
```

## Project Structure

```
shining-crown/
├── src/
│   ├── app/
│   │   ├── page.tsx              # Main game page
│   │   └── api/                  # API routes (spin, wallet, printer)
│   ├── components/game/
│   │   ├── PixiGame.tsx          # PIXI React component
│   │   ├── PixiGameIntegration.tsx  # Integration wrapper
│   │   ├── useSpinLogic.ts       # Reel spin logic
│   │   ├── useWinAnimations.ts   # Win animation logic
│   │   └── ...                   # Other game hooks
│   ├── types/
│   │   ├── pixi-react.d.ts       # PIXI React JSX types
│   │   └── keyboard.ts           # Game state types
│   └── utils/                    # Utilities (currency, sounds, etc)
├── public/assets/                # Game assets (sprites, sounds)
└── data/                         # Game data (wallet, transactions)
```

## Features

- ✅ 5-reel, 3-row slot machine
- ✅ 10 paylines
- ✅ Wild symbol expansion
- ✅ Win animations (57-frame sequences)
- ✅ Gamble feature (double or nothing)
- ✅ Multiple denominations
- ✅ Voucher system (in/out)
- ✅ Thermal printer support
- ✅ Touch keyboard integration
- ✅ Mobile controller support
- ✅ Bilingual UI (English/Macedonian)
- ✅ Sound effects

## Documentation

### Quick Start
- **[QUICK_REFERENCE.md](QUICK_REFERENCE.md)** - One-page cheat sheet for PIXI React

### Integration Guides
- **[INTEGRATION_EXAMPLE.md](INTEGRATION_EXAMPLE.md)** - Exact code changes for integration
- **[INTEGRATION_GUIDE.md](INTEGRATION_GUIDE.md)** - Step-by-step integration strategy

### Technical Details
- **[PIXI_REACT_SUMMARY.md](PIXI_REACT_SUMMARY.md)** - Executive summary of the migration
- **[PIXI_REACT_MIGRATION_COMPLETE.md](PIXI_REACT_MIGRATION_COMPLETE.md)** - Complete migration details
- **[PIXI_REACT_QUICK_START.md](PIXI_REACT_QUICK_START.md)** - Developer guide with examples

## Development Scripts

```bash
npm run dev         # Start development server
npm run build       # Build for production
npm run start       # Start production server
npm run lint        # Run ESLint
```

## Game Configuration

### Denominations
Available denominations: 0.01, 0.05, 0.10, 0.20, 0.50, 1.00

### Bet Levels
10 bet levels from 10 to 100 credits

### Paytable
See game assets for symbol payouts

## API Endpoints

- `POST /api/spin` - Execute a spin
- `GET /api/wallet` - Get wallet balance
- `POST /api/cashout` - Process cashout
- `POST /api/voucher/validate` - Validate voucher
- `POST /api/remote-control/*` - Touch keyboard commands

## Compliance

GLI Compliant - ПРАВИЛНИК ЗА НАЧИНОТ НА УТВРДУВАЊЕТО НА ТЕХНИЧКАТА ИСПРАВНОСТ НА АВТОМАТИТЕ ЗА ИГРИ НА СРЕЌА (Член 2)

## Hardware Integration

- **Thermal Printer**: USB/Serial thermal receipt printer
- **Touch Keyboard**: Custom touch keyboard controller
- **USB Support**: For peripheral devices

## License

Proprietary - All rights reserved

## Credits

Built with:
- [Next.js](https://nextjs.org/)
- [PIXI.js](https://pixijs.com/)
- [@pixi/react](https://github.com/pixijs/pixi-react)
- [React](https://react.dev/)
- [TypeScript](https://www.typescriptlang.org/)
