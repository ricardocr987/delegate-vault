use anchor_lang::prelude::*;

// This pda is used to manage the multiple vaults, used to control instructions or action permissions
// authority: user, unique entity that can withdraw from order_vault
// delegate: wallet on crank service to trigger liquidations on SL/TP/Time
// end_subscription: if user has the subscription, it will reduce fee performance
#[account]
pub struct Manager {
    pub authority: Pubkey,
    pub delegate: Pubkey,
    pub end_subscription: i64,
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
    pub order_vault: Pubkey,
    pub deposit_amount: u64,
    pub bump: u8,
}

impl Order {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 1;
}

// This PDA is used to store the config details, have authority over the fee vaults (SOL & USDC)
// to-do: realloc the get extra space to store more new fields
#[account]
pub struct Config {
    pub authority: Pubkey,
    pub payment_mint: Pubkey,
    pub payment_receiver: Pubkey,
    pub performance_receiver: Pubkey,
    pub monthly_amount: u64,
    pub yearly_amount: u64,
    pub subscribed_performance_fee: u16, // a value of 250 corresponds to a fee of 2.5%
    pub performance_fee: u16, // user not subscribed performance fee
    pub bump: u8,
}

impl Config {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 32 + 8 + 8 + 2 + 2 + 1;
}