use anchor_lang::prelude::*;

// This pda is used to manage the multiple vaults, used to control instructions permissions
// authority: user
// delegate: wallet on crank to trigger liquidate on SL/TP/Time
#[account]
pub struct Manager {
    pub authority: Pubkey,
    pub delegate: Pubkey,
    pub stable_mint: Pubkey,
    pub bump: u8,
}

impl Manager {
    pub const LEN: usize = 8 + 32 + 32 + 32 + 1;
}