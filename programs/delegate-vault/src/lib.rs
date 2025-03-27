pub mod state;
pub mod error;
mod instructions;
use {
    anchor_lang::prelude::*,
    instructions::*,
};

declare_program!(jupiter_aggregator);
declare_id!("EqwMyZVGTMGegzvWwAsrtWvo7M8HHAuCTp8PCrXkrCuA");

#[program]
pub mod delegate_vault {
    use super::*;

    pub fn init_manager(ctx: Context<InitManager>) -> Result<()> {
        init_manager::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit::handler(ctx, amount)
    }

    pub fn swap(ctx: Context<Swap>, data: Vec<u8>) -> Result<()> {
        swap::handler(ctx, data)
    }
    
    pub fn liquidate(ctx: Context<Liquidate>, data: Vec<u8>) -> Result<()> {
        liquidate::handler(ctx, data)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        withdraw::handler(ctx)
    }
}