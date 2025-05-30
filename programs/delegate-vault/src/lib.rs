pub mod state;
pub mod error;
mod instructions;
mod permission;
use {
    anchor_lang::prelude::*,
    instructions::*,
};

declare_program!(jupiter_aggregator);
declare_id!("frnxh6RXdbpvTbhQ8yRtEbLNnXKmbGEqwfwMpZaBRw9");

#[program]
pub mod delegate_vault {
    use super::*;

    pub fn init(ctx: Context<Init>, params: InitParams) -> Result<()> {
        init::handler(ctx, params)
    }

    pub fn edit_config(ctx: Context<EditConfig>, performance_fee: u16) -> Result<()> {
        edit_config::handler(ctx, performance_fee)
    }

    pub fn init_manager(ctx: Context<InitManager>) -> Result<()> {
        init_manager::handler(ctx)
    }

    pub fn pay_subscription(ctx: Context<PaySubscription>, amount: u64) -> Result<()> {
        pay_subscription::handler(ctx, amount)
    }

    pub fn init_token_vault(ctx: Context<InitTokenVault>) -> Result<()> {
        init_token_vault::handler(ctx)
    }

    pub fn deposit(ctx: Context<Deposit>, amount: u64) -> Result<()> {
        deposit::handler(ctx, amount)
    }

    pub fn withdraw(ctx: Context<Withdraw>) -> Result<()> {
        withdraw::handler(ctx)
    }

    // JUP
    pub fn jup_swap(ctx: Context<Swap>, data: Vec<u8>) -> Result<()> {
        jup::swap::handler(ctx, data)
    }

    pub fn jup_liquidate(ctx: Context<JupLiquidate>, data: Vec<u8>) -> Result<()> {
        jup::liquidate::handler(ctx, data)
    }
    
    // ORCA
    pub fn open_position(ctx: Context<OpenPosition>, params: OrcaOpenPositionParams) -> Result<()> {
        orca::open_position::handler(ctx, params)
    }

    pub fn orca_swap(ctx: Context<OrcaSwap>, params: OrcaSwapParams) -> Result<()> {
        orca::swap::handler(ctx, params)
    }

    pub fn orca_liquidate(ctx: Context<OrcaLiquidate>, params: OrcaLiquidateParams) -> Result<()> {
        orca::liquidate::handler(ctx, params)
    }

    pub fn close_position(ctx: Context<ClosePosition>, params: OrcaClosePositionParams) -> Result<()> {
        orca::close_position::handler(ctx, params)
    }
}