use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint, TokenInterface, TokenAccount},
    crate::jupiter_aggregator::program::Jupiter,
    anchor_lang::solana_program::{instruction::Instruction, program::invoke_signed},
};

#[derive(Accounts)]
pub struct Swap<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
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
            signer.key().as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == signer.key() @ErrorCode::IncorrectSigner
    )]
    pub manager: Box<Account<'info, Manager>>,

    #[account(
        mut,
        constraint = token_vault.owner == manager.key() @ErrorCode::IncorrectOwner
    )]
    pub order_vault: InterfaceAccount<'info, TokenAccount>,

    pub output_mint: InterfaceAccount<'info, Mint>,
    pub output_mint_program: Interface<'info, TokenInterface>,

    #[account(
        init,
        payer = signer,
        seeds = [
            b"token_vault".as_ref(),
            signer.key().as_ref(),
            manager.key().as_ref(),
            order.key().as_ref(),
            output_mint.key().as_ref(),
        ],
        bump,
        token::mint = output_mint,
        token::authority = manager,
        token::token_program = output_mint_program,
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,
    pub jupiter_program: Program<'info, Jupiter>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(ctx: Context<Swap>, data: Vec<u8>) -> Result<()> {
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
        manager.project.as_ref(),
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

    Ok(())
}
