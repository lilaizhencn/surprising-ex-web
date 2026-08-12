# Surprising EX - Product Specification & Roadmap

## Product Vision
A world-class digital asset exchange focusing on clarity, trust, and professional efficiency.

## Core Features
1. **Market Center**: Real-time asset tracking with filtering and sorting.
2. **Trading Terminals**:
   - Spot Trading
   - USD-M Perpetuals
   - Coin-M Perpetuals
   - Delivery Futures
   - Options (Pro-lite interface)
3. **Asset Management**:
   - Unified overview
   - Multi-account structure (Spot, Futures, Options)
   - Step-by-step Deposit, Withdraw, and Transfer flows.
4. **Security & Compliance**:
   - Multi-step Registration/Login
   - 2FA & Security Center
   - KYC/Identity Verification flow

## Technical Architecture
- **Framework**: Next.js 14+ (App Router)
- **Styling**: Tailwind CSS + shadcn/ui
- **State**: Zustand (Client state), TanStack Query (API state)
- **Icons**: Lucide React
- **Charts**: TradingView Lightweight Charts
- **Validation**: Zod + React Hook Form

## Directory Structure
- `/app`: Pages and Layouts
- `/components`:
  - `/ui`: Base shadcn components
  - `/shared`: Navigation, Footer, Layout wrappers
  - `/trading`: Orderbook, K-line, Order forms
  - `/finance`: Asset cards, Transaction lists
- `/hooks`: Custom logic (auth, balance, market data)
- `/lib`: Utils (formatting, constants)
- `/services`: Mock data providers and API service layer
- `/store`: Zustand stores
- `/types`: Strict TypeScript definitions
