use {
    crate::state::*,
    anchor_lang::prelude::*,
    crate::error::ErrorCode,
    anchor_spl::token_interface::{Mint, TokenInterface},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct InitParams {
    subscribed_performance_fee: u16,
    performance_fee: u16,
    monthly_amount: u64,
    yearly_amount: u64,
}

#[derive(Accounts)]
pub struct Init<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        space = Config::LEN,
        payer = signer,
        seeds = [b"config".as_ref()],
        bump,
    )]
    pub config: Box<Account<'info, Config>>,
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: initializing config with a payment receiver
    pub payment_receiver: AccountInfo<'info>,
    /// CHECK: initializing config with a performance receiver
    pub performance_receiver: AccountInfo<'info>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<Init>, params: InitParams) -> Result<()> {
    if params.performance_fee > 10000 || params.subscribed_performance_fee > 10000 {
        return Err(ErrorCode::IncorrectFee.into());
    }

    let config = &mut ctx.accounts.config;

    config.authority = ctx.accounts.signer.key();
    config.payment_mint = ctx.accounts.payment_mint.key();
    config.payment_receiver = ctx.accounts.payment_receiver.key();
    config.performance_receiver = ctx.accounts.performance_receiver.key();
    config.monthly_amount = params.monthly_amount;
    config.yearly_amount = params.yearly_amount;
    config.subscribed_performance_fee = params.subscribed_performance_fee;
    config.performance_fee = params.performance_fee;
    config.bump = ctx.bumps.config;
    
    Ok(())
}
