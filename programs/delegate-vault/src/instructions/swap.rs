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
    pub order: SystemAccount<'info>,
    
    #[account(
        mut,
        seeds = [
            b"manager".as_ref(),
            manager.authority.as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == signer.key() @ErrorCode::IncorrectSigner
    )]
    pub manager: Account<'info, Manager>,

    #[account(
        constraint = manager.stable_mint == input_mint.key() @ErrorCode::IncorrectMint
    )]
    pub input_mint: InterfaceAccount<'info, Mint>,
    pub input_mint_program: Interface<'info, TokenInterface>,
    pub output_mint: InterfaceAccount<'info, Mint>,
    pub output_mint_program: Interface<'info, TokenInterface>,

    // on swap will be an order_vault, on liquidate will be a token_vault
    // derive address from seeds on client txn builder
    #[account(
        mut,
        seeds = [
            b"order_vault".as_ref(),
            order.key().as_ref(),
            input_mint.key().as_ref(),
        ],
        bump,
    )]
    pub input_ata: InterfaceAccount<'info, TokenAccount>,

    // on swap will be a token_vault, on liquidate will be an order_vault
    // derive address from seeds and validate ata exists (if not, add ixn) on client txn builder
    #[account(
        init,
        payer = signer,
        seeds = [
            b"token_vault".as_ref(),
            order.key().as_ref(),
            output_mint.key().as_ref(),
        ],
        bump,
        token::mint = output_mint,
        token::authority = manager,
        token::token_program = token_program,
    )]
    pub ouput_ata: InterfaceAccount<'info, TokenAccount>,
    pub jupiter_program: Program<'info, Jupiter>,
    pub token_program: Interface<'info, TokenInterface>,
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
