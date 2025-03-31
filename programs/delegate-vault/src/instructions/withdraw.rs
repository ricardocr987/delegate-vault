use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::AssociatedToken,
        token_interface::{Mint, TokenInterface, TokenAccount, TransferChecked, CloseAccount, transfer_checked, close_account},
    }
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    // ephemeral account to use as ID
    pub order: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [
            b"manager".as_ref(),
            signer.key().as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == signer.key() @ErrorCode::IncorrectSigner
    )]
    pub manager: Box<Account<'info, Manager>>,
    #[account(
        mut,
        seeds = [
            b"order_vault".as_ref(), 
            order.key().as_ref(),
            stable_mint.key().as_ref(),
        ],
        bump,
    )]
    pub stable_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint=stable_mint,
        associated_token::authority=manager.authority,
        associated_token::token_program=token_program,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    pub stable_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler<'info>(ctx: Context<Withdraw>) -> Result<()> {
    let manager = &ctx.accounts.manager;
    let seeds = &[
        b"manager".as_ref(),
        manager.authority.as_ref(),
        &[manager.bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.stable_vault.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.manager.to_account_info(),
                mint: ctx.accounts.stable_mint.to_account_info(),
            },
            &[&seeds[..]],
        ),
        ctx.accounts.stable_vault.amount,
        ctx.accounts.stable_mint.decimals,
    )?;

    close_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.stable_vault.to_account_info(),
                destination: ctx.accounts.user_ata.to_account_info(),   
                authority: ctx.accounts.manager.to_account_info(),
            },
            &[&seeds[..]],
        ),
    )?;

    Ok(())
}
