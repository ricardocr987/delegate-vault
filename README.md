# Delegate Vault

A Solana program that creates vaults controlled by a delegate wallet in a crank service to trigger liquidation on a user portfolio. This program enables automated portfolio management with stop-loss, take-profit, and time-based liquidation capabilities.

## Program Instructions

The program provides the following instructions:

1. `init_manager` - Initialize a manager account that controls multiple the order and token vaults
   - Sets the authority (user, which deposit, swap and witdraw) and delegate (crank service wallet, which liquidate positions)
   - Configures the stable mint for the vault (USDC as default on transaction building)

2. `deposit` - Deposit funds into the vault
   - Allows users to deposit specified amounts into their order vault

3. `swap` - Execute token swaps within the vault
   - Performs token swaps using provided swap data from jupiter api

4. `liquidate` - Trigger liquidation of the portfolio
   - Can be called by the delegate wallet to liquidate positions
   - The crank service with the delegate wallet should handle the liquidation

5. `withdraw` - Withdraw funds from the vault
   - Allows users to withdraw their funds from the vault when the postion is closed and returned to order vault

The process would be like:
1. User creates manager
2. User deposits (creating an order vault with usdc) and swap to another token (which is deposited on a token vault)
3. Crank service or user close the position making the usdc come back to the order vault
4. User withdraw the usdc from the order vault

Notes: 
- 1st user transaction should include init_manager, deposit and swap instructions
- When the user is liquidating we should gather liquidate and withdraw instructions in same transaction

## Program Structure

- `lib.rs` - Main program entry point and instruction definitions
- `state.rs` - Program state definitions (Manager account)
- `instructions/` - Implementation of individual instructions
- `error.rs` - Custom error definitions

## Building the Program

To build the program, use the following command:

```bash
RUSTUP_TOOLCHAIN="nightly-2024-11-19" anchor build
```

Note: The specific nightly toolchain is required due to Solana-specific configurations. Reference: [Solana Stack Exchange](https://solana.stackexchange.com/questions/17777/unexpected-cfg-condition-value-solana)