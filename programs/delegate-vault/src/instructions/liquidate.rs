use {
    crate::state::*,
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint, TokenInterface, TokenAccount, CloseAccount, close_account},
    crate::jupiter_aggregator::program::Jupiter,
    crate::error::ErrorCode,
    anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed},
};

#[derive(Accounts)]
pub struct Liquidate<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub order: SystemAccount<'info>,
    pub user: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [
            b"manager".as_ref(),
            manager.authority.as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == user.key() 
            && manager.delegate == signer.key() @ErrorCode::IncorrectSigner
    )]
    pub manager: Account<'info, Manager>,

    pub input_mint: InterfaceAccount<'info, Mint>,
    pub input_mint_program: Interface<'info, TokenInterface>,
    #[account(
        constraint = manager.stable_mint == input_mint.key() @ErrorCode::IncorrectMint
    )]
    pub output_mint: InterfaceAccount<'info, Mint>,
    pub output_mint_program: Interface<'info, TokenInterface>,

    #[account(
        mut,
        seeds = [
            b"token_vault".as_ref(),
            order.key().as_ref(),
            input_mint.key().as_ref(),
        ],
        bump,
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        seeds = [
            b"order_vault".as_ref(),
            order.key().as_ref(),
            output_mint.key().as_ref(),
        ],
        bump,
    )]
    pub order_vault: InterfaceAccount<'info, TokenAccount>,
    pub jupiter_program: Program<'info, Jupiter>,
}

pub fn handler<'info>(ctx: Context<Liquidate>, data: Vec<u8>) -> Result<()> {
    let manager = &ctx.accounts.manager;
    let accounts: Vec<AccountMeta> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| {
            let is_signer = acc.key == &ctx.accounts.manager.key();
            AccountMeta {
                pubkey: *acc.key,
                is_signer,
                is_writable: acc.is_writable,
            }
        })
        .collect();

    let accounts_infos: Vec<AccountInfo> = ctx
        .remaining_accounts
        .iter()
        .map(|acc| AccountInfo { ..acc.clone() })
        .collect();

    let signer_seeds = &[
        b"manager".as_ref(),
        manager.authority.as_ref(),
        &[manager.bump],
    ];

    invoke_signed(
        &Instruction {
            program_id: ctx.accounts.jupiter_program.key(),
            accounts,
            data,
        },
        &accounts_infos,
        &[&signer_seeds[..]],
    )?;

    close_account( 
        CpiContext::new_with_signer(
        ctx.accounts.output_mint_program.to_account_info(), 
        CloseAccount {
            account: ctx.accounts.token_vault.to_account_info(),
            destination: ctx.accounts.user.to_account_info(),
            authority: ctx.accounts.manager.to_account_info(),
        },
        &[&signer_seeds[..]],
    ))?;

    Ok(())
}
