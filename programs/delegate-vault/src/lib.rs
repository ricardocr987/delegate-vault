pub mod state;
pub mod error;
mod instructions;
use {
    anchor_lang::prelude::*,
    instructions::*,
};

declare_program!(jupiter_aggregator);
declare_id!("AHNJKkm4Gd3FpUrdhYsuvf7tPErUpR8dgmx6xNPSHNuc");

#[program]
pub mod delegate_vault {
    use super::*;

    pub fn init_project(ctx: Context<InitProject>, performance_fee: u16) -> Result<()> {
        init_project::handler(ctx, performance_fee)
    }

    pub fn edit_project_fee(ctx: Context<EditProjectFee>, performance_fee: u16) -> Result<()> {
        edit_project_fee::handler(ctx, performance_fee)
    }

    pub fn withdraw_fees(ctx: Context<WithdrawFees>) -> Result<()> {
        withdraw_fees::handler(ctx)
    }

    pub fn init_manager(ctx: Context<InitManager>) -> Result<()> {
        init_manager::handler(ctx)
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
    
    pub fn jup_liquidate(ctx: Context<Liquidate>, data: Vec<u8>) -> Result<()> {
        jup::liquidate::handler(ctx, data)
    }

    // ORCA
    pub fn open_position(ctx: Context<OpenPosition>, tick_lower_index: i32, tick_upper_index: i32) -> Result<()> {
        orca::open_position::handler(ctx, tick_lower_index, tick_upper_index)
    }

    pub fn increase_liquidity(ctx: Context<IncreaseLiquidity>, liquidity_amount: u128, token_max_a: u64, token_max_b: u64) -> Result<()> {
        orca::increase_liquidity::handler(ctx, liquidity_amount, token_max_a, token_max_b)
    }

    pub fn decrease_liquidity(ctx: Context<DecreaseLiquidity>, liquidity_amount: u128, token_min_a: u64, token_min_b: u64) -> Result<()> {
        orca::decrease_liquidity::handler(ctx, liquidity_amount, token_min_a, token_min_b)
    }

    pub fn collect_fees(ctx: Context<CollectFees>) -> Result<()> {
        orca::collect_fees::handler(ctx)
    }

    pub fn close_position(ctx: Context<ClosePosition>) -> Result<()> {
        orca::close_position::handler(ctx)
    }

    pub fn orca_swap(ctx: Context<OrcaSwap>, params: OrcaSwapParams) -> Result<()> {
        orca::swap::handler(ctx, params)
    }

    pub fn orca_liquidate(ctx: Context<OrcaLiquidate>, params: OrcaLiquidateParams) -> Result<()> {
        orca::liquidate::handler(ctx, params)
    }
}