# Delegate Vault

A Solana program that creates vaults controlled by a delegate wallet in a crank service to trigger liquidation on a user portfolio. This program enables automated portfolio and liquidity pool management with stop-loss, take-profit, and time-based liquidation capabilities.

## Overview

The Delegate Vault program allows users to:
- Create managed vaults for automated trading and liquidity provision
- Deposit funds and execute token swaps
- Participate in Orca liquidity pools with automated position management
- Configure automated liquidation triggers through a delegate service
- Collect performance fees and manage positions

## Program Architecture

### Accounts
1. **Manager Account**: Controls multiple vaults and manages permissions
   - Authority (User wallet) - Can deposit, swap, and withdraw
   - Delegate (Service wallet) - Can trigger liquidations
   - Project - Associates the manager with a specific project

2. **Order Account**: Tracks individual order details and positions
   - Stores deposit information
   - Links to associated vaults
   - Used for performance fee calculations

3. **Project Account**: Manages project-level configurations
   - Controls fee settings
   - Manages fee collection vaults

## Transaction Flow

### 1. Initial Setup (Tx1)
- Initialize manager account (if not done before)
- Deposit funds to order vault
  - Creates new order account and order vault

### 2. Position Management
#### Opening Positions (Tx2)
- Swap to token vault (do 50% of order vault amount for orca lps)
  - Creates a token vault
  - Execute token swaps via Jupiter/Orca
(Tx3)
- Open position and increase liquidity in case is an orca order

### 3. Liquidation Flow (Tx4)
- Triggered by delegate wallet
- Decrease liquidity and collect fees in case is an orca order
- Swap back to deposit mint
- Close token vault positions, return SOL rent to users

### 4. Withdrawal Flow (Tx5)
- User can also liquidate the position, if not done
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
  - `orca/` - Orca integration instructions
    - Position management (open, close)
    - Liquidity operations (increase, decrease)
    - Fee collection
  - `jup/` - Jupiter integration
- `error.rs` - Custom error definitions

## Development versions

solana-cli 2.0.21
anchor-cli 0.30.1
rustc 1.79.0