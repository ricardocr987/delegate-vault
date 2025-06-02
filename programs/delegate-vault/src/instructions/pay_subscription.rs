use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint, TokenInterface, TokenAccount, TransferChecked, transfer_checked},
};

#[derive(Accounts)]
pub struct PaySubscription<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"manager".as_ref(),
            signer.key().as_ref(),
        ],
        bump = manager.bump,
    )]
    pub manager: Box<Account<'info, Manager>>,
    #[account(
        seeds = [
            b"config".as_ref(),
        ],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    #[account(
        mut,
        constraint = payment_mint.key() == config.payment_mint @ErrorCode::IncorrectPaymentMint,
    )]
    pub payment_mint: Box<InterfaceAccount<'info, Mint>>,
    /// CHECK: only validate address
    #[account(
        mut,
        constraint = payment_receiver.key() == config.payment_receiver @ErrorCode::IncorrectReceiver,
    )]
    pub payment_receiver: AccountInfo<'info>,

    #[account(
        mut,
        associated_token::mint=payment_mint,
        associated_token::authority=payment_receiver,
        associated_token::token_program=token_program,
    )]
    pub payment_receiver_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(
        mut,
        associated_token::mint=payment_mint,
        associated_token::authority=signer,
        associated_token::token_program=token_program,
    )]
    pub signer_ata: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<PaySubscription>, amount: u64) -> Result<()> {
    let manager = &mut ctx.accounts.manager;
    let config = &ctx.accounts.config;

    // Validate payment amount matches either monthly or yearly subscription
    if amount != config.monthly_amount && amount != config.yearly_amount {
        return Err(ErrorCode::IncorrectPaymentAmount.into());
    }

    // Transfer payment
    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(), 
            TransferChecked {
                from: ctx.accounts.signer_ata.to_account_info(),
                to: ctx.accounts.payment_receiver_ata.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
                mint: ctx.accounts.payment_mint.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.payment_mint.decimals,
    )?;

    // Calculate subscription end date based on payment amount
    let current_time = Clock::get()?.unix_timestamp;
    let subscription_duration = if amount == config.yearly_amount {
        // 365 days in seconds
        365 * 24 * 60 * 60
    } else {
        // 30 days in seconds
        30 * 24 * 60 * 60
    };

    // If subscription hasn't expired, extend from current end date
    // Otherwise extend from current time
    let start_time = if manager.end_subscription > current_time {
        manager.end_subscription
    } else {
        current_time
    };

    manager.end_subscription = start_time.checked_add(subscription_duration)
        .ok_or(ErrorCode::ArithmeticOverflow)?;

    Ok(())
}
