use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{TokenInterface, TokenAccount, CloseAccount, close_account},
};

#[derive(Accounts)]
pub struct CloseTokenVault<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub user: SystemAccount<'info>,
    // ephemeral account to use as order ID, should be stored on db, to build the swap, liquidate and withdraw instructions
    pub id: SystemAccount<'info>,
    #[account(
        seeds = [
            b"order".as_ref(),
            manager.key().as_ref(),
            id.key().as_ref(),
        ],
        bump,
        constraint = order.manager == manager.key() @ErrorCode::IncorrectManager,
    )]
    pub order: Box<Account<'info, Order>>,
    #[account(
        seeds = [
            b"manager".as_ref(),
            manager.project.as_ref(),
            manager.authority.as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == user.key()
            && (manager.delegate == signer.key() || (
                manager.authority == signer.key() && user.key() == signer.key()
            )) 
            @ErrorCode::IncorrectSigner
    )]
    pub manager: Account<'info, Manager>,
    #[account(
        mut,
        seeds = [
            b"token_vault".as_ref(),
            user.key().as_ref(),
            manager.key().as_ref(),
            order.key().as_ref(),
            token_vault.mint.key().as_ref(),
        ],
        bump,
        constraint = token_vault.owner == manager.key() @ErrorCode::IncorrectOwner
    )]
    pub token_vault: Box<InterfaceAccount<'info, TokenAccount>>,

    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<CloseTokenVault>) -> Result<()> {
    let manager = &ctx.accounts.manager;
    let signer_seeds = &[
        b"manager".as_ref(),
        manager.project.as_ref(),
        manager.authority.as_ref(),
        &[manager.bump],
    ];

    // Close the token vault
    close_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.token_vault.to_account_info(),
                destination: ctx.accounts.user.to_account_info(),
                authority: ctx.accounts.manager.to_account_info(),
            },
            &[&signer_seeds[..]],
        )
    )?;

    Ok(())
}