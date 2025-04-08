use {
    crate::{error::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{transfer_checked, Mint, TokenAccount, TokenInterface, TransferChecked},
};

#[derive(Accounts)]
pub struct WithdrawFees<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,

    #[account(
        mut,
        seeds = [
            b"project".as_ref(),
            project.authority.as_ref(),
        ],
        bump = project.bump,
        constraint = signer.key() == project.authority @ErrorCode::IncorrectSigner
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        associated_token::mint=mint,
        associated_token::authority=signer,
        associated_token::token_program=token_program,
    )]
    pub project_owner_ata: InterfaceAccount<'info, TokenAccount>,

    #[account(
        mut,
        associated_token::mint=mint,
        associated_token::authority=project,
        associated_token::token_program=token_program,
    )]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,
    pub mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<WithdrawFees>) -> Result<()> {
    let project = &ctx.accounts.project;
    let seeds = &[
        b"project".as_ref(),
        project.authority.as_ref(),
        &[project.bump],
    ];

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.fee_vault.to_account_info(),
                to: ctx.accounts.project_owner_ata.to_account_info(),
                authority: project.to_account_info(),
                mint: ctx.accounts.mint.to_account_info(),
            },
            &[&seeds[..]],
        ),
        ctx.accounts.fee_vault.amount,
        ctx.accounts.mint.decimals,
    )?;

    Ok(())
}
