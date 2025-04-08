use anchor_lang::prelude::*;

// This pda is used to manage the multiple vaults, used to control instructions or action permissions
// project: project that the manager belongs to
// authority: user, unique entity that can withdraw from order_vault
// delegate: wallet on crank service to trigger liquidations on SL/TP/Time
#[account]
pub struct Manager {
    pub project: Pubkey,
    pub authority: Pubkey,
    pub delegate: Pubkey,
    pub bump: u8,
}

impl Manager {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 1;
}

// This PDA is used to store the order details, validate on liquidation the mint deposited and to calculate the performance fee each position represents an order, 
// have its own vaults, that store the tokens deposited or swapped by the user, so we can track the user inventory on-chain easier
#[account]
pub struct Order {
    pub id: Pubkey,
    pub manager: Pubkey,
    pub deposit_mint: Pubkey,
    pub deposit_amount: u64,
    pub bump: u8,
}

impl Order {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 8 + 1;
}

// This PDA is used to store the project details, have authority over the fee vaults (SOL & USDC)
#[account]
pub struct Project {
    pub authority: Pubkey,
    pub performance_fee: u16,    // a value of 250 corresponds to a fee of 2.5%
    pub bump: u8,
}

impl Project {
    pub const LEN: usize = 8 + 32 + 2 + 1;
}