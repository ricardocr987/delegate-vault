use {
    crate::{error::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::{
        associated_token::AssociatedToken,
        token_interface::{close_account, transfer_checked, CloseAccount, Mint, TokenAccount, TokenInterface, TransferChecked},
    },
    spl_math::precise_number::PreciseNumber,
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
            signer.key().as_ref(),
        ],
        bump = manager.bump,
        constraint = manager.authority == signer.key() @ErrorCode::IncorrectSigner, // only user can withdraw
    )]
    pub manager: Account<'info, Manager>,

    #[account(
        mut,
        seeds = [
            b"config".as_ref(),
        ],
        bump = config.bump,
    )]
    pub config: Box<Account<'info, Config>>,

    /// CHECK: only validate address
    #[account(constraint = performance_receiver.key() == config.performance_receiver @ErrorCode::IncorrectReceiver)]
    pub performance_receiver: AccountInfo<'info>,

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
        constraint = order_vault.owner == manager.key() @ErrorCode::IncorrectOwner,
        constraint = order_vault.key() == order.order_vault @ErrorCode::IncorrectOrderVault,
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
        associated_token::authority=performance_receiver,
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
    let signer_key = ctx.accounts.signer.key();
    let seeds = &[
        b"manager".as_ref(),
        signer_key.as_ref(),
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
    
    // Constants for fee calculations
    const BASIS_POINTS: u128 = 10000;  // 100% = 10000 basis points
    
    // Calculate performance fee only if there is profit
    let performance_fee = if profit > 0 {
        // Check if user has active subscription
        let current_time = Clock::get()?.unix_timestamp;
        
        // Determine fee rate based on subscription status
        let fee_rate: u16 = if manager.end_subscription > current_time {
            // User has active subscription, use subscribed rate
            ctx.accounts.config.subscribed_performance_fee
        } else {
            // User not subscribed, use regular rate
            ctx.accounts.config.performance_fee
        };

        // Convert profit and fee rate to PreciseNumber for accurate calculation
        let profit_precise = PreciseNumber::new(profit as u128)
            .ok_or(ErrorCode::NumericalOverflow)?;
        
        // Convert fee rate from basis points (e.g., 250 = 2.50%) to decimal
        let fee_rate_precise = PreciseNumber::new(fee_rate as u128)
            .ok_or(ErrorCode::NumericalOverflow)?;
            
        let basis_points_precise = PreciseNumber::new(BASIS_POINTS)
            .ok_or(ErrorCode::NumericalOverflow)?;

        // Calculate fee rate in decimal form (divide by 10000)
        let fee_rate_decimal = fee_rate_precise
            .checked_div(&basis_points_precise)
            .ok_or(ErrorCode::NumericalOverflow)?;

        // Calculate fee amount: profit * fee_rate
        let fee_amount_precise = profit_precise
            .checked_mul(&fee_rate_decimal)
            .ok_or(ErrorCode::NumericalOverflow)?;

        // Convert back to u64
        fee_amount_precise
            .to_imprecise()
            .ok_or(ErrorCode::NumericalOverflow)?
            .try_into()
            .map_err(|_| ErrorCode::NumericalOverflow)?
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
