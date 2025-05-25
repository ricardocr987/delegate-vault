use {
    crate::{error::ErrorCode, jupiter_aggregator::program::Jupiter, permission::{verify_permission, is_jupiter_instruction, JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR, JUPITER_SHARED_ACCOUNTS_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR, JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR}, state::*},
    anchor_lang::{prelude::*, solana_program::{instruction::Instruction, program::invoke_signed}},
    anchor_spl::token_interface::{close_account, CloseAccount, TokenAccount, TokenInterface},
};

#[derive(Accounts)]
pub struct JupLiquidate<'info> {
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
            && (manager.delegate == signer.key() || manager.authority == signer.key()) 
            @ErrorCode::IncorrectSigner
    )]
    pub manager: Box<Account<'info, Manager>>,

    #[account(
        mut,
        constraint = manager_vault_a.owner == manager.key() @ErrorCode::IncorrectManager
    )]
    pub manager_vault_a: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        constraint = manager_vault_b.owner == manager.key() @ErrorCode::IncorrectManager
    )]
    pub manager_vault_b: Box<InterfaceAccount<'info, TokenAccount>>,

    pub jupiter_program: Program<'info, Jupiter>,
    pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler<'info>(ctx: Context<JupLiquidate>, data: Vec<u8>) -> Result<()> {
    let manager = &ctx.accounts.manager;
    let signer = &ctx.accounts.signer;
    let deposit_mint = &ctx.accounts.order.deposit_mint;
    let manager_vault_a = &ctx.accounts.manager_vault_a;
    let manager_vault_b = &ctx.accounts.manager_vault_b;
    let order = &ctx.accounts.order;
    
    let (deposit_vault, token_vault) = if manager_vault_a.mint == *deposit_mint {
        (&manager_vault_a, &manager_vault_b)
    } else if manager_vault_b.mint == *deposit_mint {
        (&manager_vault_b, &manager_vault_a)
    } else {
        return Err(ErrorCode::IncorrectMint.into());
    };

    // Verify permissions at the beginning
    verify_permission(signer, deposit_vault, token_vault, manager, true)?;

    // Verify that the instruction data is a valid Jupiter instruction
    if !is_jupiter_instruction(&data) {
        return Err(ErrorCode::InvalidJupiterRoute.into());
    }

    if ctx.remaining_accounts.len() < 6 {
        return Err(ErrorCode::InvalidRemainingAccounts.into());
    }

    // Parse discriminator
    let discriminator = &data[0..8];
    let is_shared_accounts_route =
        discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR ||
        discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR ||
        discriminator == JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR;

    // Select indices based on instruction type
    let (transfer_authority_idx, source_token_account_idx, destination_token_account_idx, destination_mint_idx) = if is_shared_accounts_route {
        (2, 3, 6, 8)
    } else {
        (1, 2, 4, 5)
    };

    let transfer_authority = &ctx.remaining_accounts[transfer_authority_idx].key();
    let source_token_account = &ctx.remaining_accounts[source_token_account_idx].key();
    let destination_token_account = &ctx.remaining_accounts[destination_token_account_idx].key();
    let destination_mint = &ctx.remaining_accounts[destination_mint_idx].key();

    // Validate that transfer authority is the manager
    if transfer_authority != &manager.key() {
        return Err(ErrorCode::InvalidTransferAuthority.into());
    }

    // Validate source token account matches one of the vaults
    if source_token_account != &manager_vault_a.key() && source_token_account != &manager_vault_b.key() {
        return Err(ErrorCode::InvalidSourceTokenAccount.into());
    }

    // Validate destination token account matches one of the vaults
    if destination_token_account != &manager_vault_a.key() && destination_token_account != &manager_vault_b.key() {
        if &order.deposit_mint != deposit_mint {
            return Err(ErrorCode::InvalidDestinationTokenAccount.into());
        }
    }

    // For shared_accounts_route, check destination mint at index 8
    if destination_mint != deposit_mint {
        return Err(ErrorCode::IncorrectMint.into());
    }

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

    close_account( 
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(), 
            CloseAccount {
                account: token_vault.to_account_info(),
                destination: ctx.accounts.user.to_account_info(),
                authority: ctx.accounts.manager.to_account_info(),
        },
        &[&signer_seeds[..]],
    ))?;

    Ok(())
}