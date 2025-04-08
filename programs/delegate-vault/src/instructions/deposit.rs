use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint, TokenInterface, TokenAccount, TransferChecked, transfer_checked},
};

#[derive(Accounts)]
pub struct Deposit<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    // ephemeral account to use as order ID, should be stored on db, to build the swap, liquidate and withdraw instructions
    pub id: SystemAccount<'info>,
    #[account(
        init,
        payer = signer,
        space = Order::LEN,
        seeds = [
            b"order".as_ref(),
            manager.key().as_ref(),
            id.key().as_ref(),
        ],
        bump,
    )]
    pub order: Box<Account<'info, Order>>,
    #[account(
        seeds = [
            b"manager".as_ref(),
            manager.project.as_ref(),
            signer.key().as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == signer.key() @ErrorCode::IncorrectSigner
    )]
    pub manager: Box<Account<'info, Manager>>,
    pub deposit_mint: InterfaceAccount<'info, Mint>,
    #[account(
        mut,
        associated_token::mint=deposit_mint,
        associated_token::authority=signer,
        associated_token::token_program=token_program,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        init,
        payer = signer,
        seeds = [
            b"order_vault".as_ref(),
            signer.key().as_ref(),
            manager.key().as_ref(),
            order.key().as_ref(),
            deposit_mint.key().as_ref(),
        ],
        bump,
        token::mint = deposit_mint,
        token::authority = manager,
        token::token_program = token_program,
    )]
    pub order_vault: InterfaceAccount<'info, TokenAccount>,
    pub token_program: Interface<'info, TokenInterface>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(ctx: Context<Deposit>, amount: u64) -> Result<()> {
    let order = &mut ctx.accounts.order;
    order.id = ctx.accounts.id.key();
    order.manager = ctx.accounts.manager.key();
    order.deposit_mint = ctx.accounts.deposit_mint.key();
    order.deposit_amount = amount;
    order.bump = ctx.bumps.order;

    transfer_checked(
        CpiContext::new(
            ctx.accounts.token_program.to_account_info(), 
            TransferChecked {
                from: ctx.accounts.user_ata.to_account_info(),
                to: ctx.accounts.order_vault.to_account_info(),
                authority: ctx.accounts.signer.to_account_info(),
                mint: ctx.accounts.deposit_mint.to_account_info(),
            },
        ),
        amount,
        ctx.accounts.deposit_mint.decimals,
    )?;

    Ok(())
}
