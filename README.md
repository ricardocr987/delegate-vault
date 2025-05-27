# Delegate Vault

A Solana program that creates vaults controlled by a purse delegated to a crank service to trigger settlement in a user's portfolio. This program allows automated management of portfolios and liquidity pools for the purpose of establishing stop-loss, take-profit and time-dependent settlement capabilities.

## Overview

The Delegate Vault program allows users to:
- Create managed vaults for automated trading and liquidity provision (only for liquidation)
- Deposit funds and execute token swaps
- Participate in Orca liquidity pools with automated position management
- Configure automated liquidation triggers through a delegate service
- Collect performance fees and manage positions

## Program Architecture

### Accounts
1. **Manager Account**: Controls multiple vaults and manages permissions
   - Authority (User wallet) - Can deposit, swap, modify liquidity, liquidate and withdraw
   - Delegate (Service wallet) - Can trigger liquidations
   - Project - Associates the manager with a specific project

2. **Order Account**: Tracks individual order details and positions
   - Stores deposit information
   - Used for performance fee calculations

3. **Project Account**: Manages project-level configurations
   - Controls fee settings
   - Manages fee collection vaults

## Transaction Flow

Users would need to sign multiple transaction to set-up the order: Tx1, Tx2 and Tx3 (in case is an orca order)

### 1. Initial Setup (Tx1)
- Initialize manager account (if not done before)
- Deposit funds to order vault
  - Creates new order account and order vault

### 2. Position Management
#### Opening Positions (Tx2)
- Swap to token vault (do 50% of order vault amount for orca lps)
  - Creates token vault(s)
  - Execute token swaps via Jupiter/Orca
 
#### Orca position (Tx3)
- Open orca position and increase liquidity

### 3. Liquidation Flow (Tx4)
- Triggered by delegate wallet or user
- Decrease liquidity and collect fees in case is an orca order
- Swap back to deposit mint (can happen two swaps to comeback to the user initial position)
- Close token vault positions, return SOL rent to users

### 4. Withdrawal Flow (Tx5)
- Get performance fee
- Close order and order vault, return SOL rent to users

## Security Notes
- Transactions require appropriate signatures:
  - User signatures for deposits and withdrawals
  - Server wallet signatures for liquidation operations
- Position closure is restricted to deposit mint only

## Program Structure

- `lib.rs` - Main program entry point and instruction definitions
- `state.rs` - Program state definitions (Manager, Order, Project accounts)
- `instructions/` - Implementation of individual instructions
  - `init_manager.rs` - Manager initialization
  - `deposit.rs` - Deposit handling
  - `withdraw.rs` - Withdrawal processing
  - `orca/` - Orca integration instructions (open, close, swap and liquidation)
  - `jup/` - Jupiter integration (swap and liquidation)
- `error.rs` - Custom error definitions

## Development versions

solana-cli 2.0.21
anchor-cli 0.30.1
rustc 1.79.0

## Building:

- anchor build

If use encounter some proc_macro2 issues:

- RUSTUP_TOOLCHAIN=nightly-2024-11-19 anchor build

## Testing

To run tests, follow these steps:

1. Prepare test keys:
```
bun run test:prepare
```

2. Run project tests:
```
bun run test:project
```

3. Run specific tests:
```
bun run test:<test-name>
```