use {
    crate::{error::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::AssociatedToken,
        token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
    },
    std::str::FromStr,
};

#[derive(Accounts)]
pub struct Withdraw<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    // ephemeral account to use as order ID, should be stored on db, to build the swap, liquidate and withdraw instructions
    pub id: SystemAccount<'info>,
    #[account(
        mut,
        seeds = [
            b"order".as_ref(),
            manager.key().as_ref(),
            id.key().as_ref(),
        ],
        bump,
        constraint = order.manager == manager.key() @ErrorCode::IncorrectManager,
        close = signer, // close the order vault
    )]
    pub order: Box<Account<'info, Order>>,

    #[account(
        seeds = [
            b"manager".as_ref(),
            project.key().as_ref(),
            signer.key().as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == signer.key() @ErrorCode::IncorrectSigner, // only user can withdraw
        constraint = manager.project == project.key() @ErrorCode::IncorrectProject
    )]
    pub manager: Account<'info, Manager>,

    #[account(
        seeds = [
            b"project".as_ref(),
            project.authority.as_ref(),
        ],
        bump = project.bump,
        constraint = project.key() == Pubkey::from_str("CThXy1nb8YgSDjKpWRn4znasTbEdmXggJ9hoHEMdYfiQ").unwrap() @ErrorCode::IncorrectProject
    )]
    pub project: Account<'info, Project>,

    #[account(
        mut,
        seeds = [
            b"order_vault".as_ref(), 
            signer.key().as_ref(),
            manager.key().as_ref(),
            order.key().as_ref(),
            deposit_mint.key().as_ref(),
        ],
        bump,
        constraint = order_vault.owner == manager.key() @ErrorCode::IncorrectOwner
    )]
    pub order_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut,
        associated_token::mint=deposit_mint,
        associated_token::authority=manager.authority,
        associated_token::token_program=token_program,
    )]
    pub user_ata: InterfaceAccount<'info, TokenAccount>,
    #[account(
        mut,
        associated_token::mint=deposit_mint,
        associated_token::authority=project,
        associated_token::token_program=token_program,
    )]
    pub fee_vault: InterfaceAccount<'info, TokenAccount>,
    #[account(
        constraint = order.deposit_mint == deposit_mint.key() @ErrorCode::IncorrectMint
    )]
    pub deposit_mint: Box<InterfaceAccount<'info, Mint>>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler<'info>(ctx: Context<Withdraw>) -> Result<()> {
    let manager = &ctx.accounts.manager;
    let seeds = &[
        b"manager".as_ref(),
        manager.project.as_ref(),
        manager.authority.as_ref(),
        &[manager.bump],
    ];

    let current_amount = ctx.accounts.order_vault.amount;
    if current_amount == 0 {
        return Err(ErrorCode::EmptyOrderVault.into());
    }
    
    let deposit_amount = ctx.accounts.order.deposit_amount;    
    let profit = if current_amount > deposit_amount {
        current_amount - deposit_amount
    } else {
        0
    };
    
    // Calculate performance fee only if there is profit
    let performance_fee = if profit > 0 {
        // Calculate 20% of profit, flooring any decimal places
        let performance_fee = (ctx.accounts.project.performance_fee as u128)
            .checked_mul(profit as u128)
            .ok_or(ErrorCode::NumericalOverflow)?
            .checked_div(10000)
            .ok_or(ErrorCode::NumericalOverflow)? as u64;
        performance_fee
    } else {
        0
    };
    
    let withdraw_amount = current_amount - performance_fee;

    transfer_checked(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            TransferChecked {
                from: ctx.accounts.order_vault.to_account_info(),
                to: ctx.accounts.user_ata.to_account_info(),
                authority: ctx.accounts.manager.to_account_info(),
                mint: ctx.accounts.deposit_mint.to_account_info(),
            },
            &[&seeds[..]],
        ),
        withdraw_amount,
        ctx.accounts.deposit_mint.decimals,
    )?;

    if performance_fee > 0 {
        transfer_checked(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                TransferChecked {
                    from: ctx.accounts.order_vault.to_account_info(),
                    to: ctx.accounts.fee_vault.to_account_info(),
                    authority: ctx.accounts.manager.to_account_info(),
                    mint: ctx.accounts.deposit_mint.to_account_info(),
                },
                &[&seeds[..]],
            ),
            performance_fee,
            ctx.accounts.deposit_mint.decimals,
        )?;
    }

    close_account(
        CpiContext::new_with_signer(
            ctx.accounts.token_program.to_account_info(),
            CloseAccount {
                account: ctx.accounts.order_vault.to_account_info(),
                destination: ctx.accounts.signer.to_account_info(),   
                authority: ctx.accounts.manager.to_account_info(),
            },
            &[&seeds[..]],
        ),
    )?;

    Ok(())
}
