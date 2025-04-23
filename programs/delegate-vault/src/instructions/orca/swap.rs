use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint, TokenInterface, TokenAccount},
    whirlpool_cpi::{program::Whirlpool as WhirlpoolProgram, state::Whirlpool},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct OrcaSwapParams {
    amount: u64,
    other_amount_threshold: u64,
    sqrt_price_limit: u128,
    amount_specified_is_input: bool,
    a_to_b: bool,
}

#[derive(Accounts)]
pub struct OrcaSwap<'info> {
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

    // to do: should be wirlpool_mint_a and wirlpool_mint_b
    // to-do: apply chack deposit mint is in the transaction
    pub input_mint: Box<InterfaceAccount<'info, Mint>>,
    pub output_mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        mut,
        constraint = manager_vault_a.owner == manager.key() @ErrorCode::IncorrectOwner
      )]
    pub manager_vault_a: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        mut, 
        constraint = manager_vault_b.owner == manager.key() @ErrorCode::IncorrectOwner
    )]
    pub manager_vault_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, constraint = token_vault_a.key() == whirlpool.token_vault_a)]
    pub token_vault_a: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut, constraint = token_vault_b.key() == whirlpool.token_vault_b)]
    pub token_vault_b: Box<InterfaceAccount<'info, TokenAccount>>,

    #[account(mut)]
    pub whirlpool: Box<Account<'info, Whirlpool>>,

    #[account(mut)]
    /// CHECK: checked by whirlpool_program
    pub tick_array_0: UncheckedAccount<'info>,
  
    #[account(mut)]
    /// CHECK: checked by whirlpool_program
    pub tick_array_1: UncheckedAccount<'info>,
  
    #[account(mut)]
    /// CHECK: checked by whirlpool_program
    pub tick_array_2: UncheckedAccount<'info>,

    #[account(mut, seeds = [b"oracle", whirlpool.key().as_ref()], bump, seeds::program = whirlpool_program.key())]
    /// CHECK: checked by whirlpool_program
    pub oracle: UncheckedAccount<'info>,

    pub whirlpool_program: Program<'info, WhirlpoolProgram>,
    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(ctx: Context<OrcaSwap>, params: OrcaSwapParams) -> Result<()> {
    let manager = &ctx.accounts.manager;
    let signer_seeds = &[
        b"manager".as_ref(),
        manager.project.as_ref(),
        manager.authority.as_ref(),
        &[manager.bump],
    ];

    whirlpool_cpi::cpi::swap(
        CpiContext::new_with_signer(
            ctx.accounts.whirlpool_program.to_account_info(),
            whirlpool_cpi::cpi::accounts::Swap {
                whirlpool: ctx.accounts.whirlpool.to_account_info(),
                token_program: ctx.accounts.token_program.to_account_info(),
                token_authority: ctx.accounts.manager.to_account_info(),
                token_owner_account_a: ctx.accounts.manager_vault_a.to_account_info(),
                token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
                token_owner_account_b: ctx.accounts.manager_vault_b.to_account_info(),
                token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
                tick_array_0: ctx.accounts.tick_array_0.to_account_info(),
                tick_array_1: ctx.accounts.tick_array_1.to_account_info(),
                tick_array_2: ctx.accounts.tick_array_2.to_account_info(),
                oracle: ctx.accounts.oracle.to_account_info(),
            },
            &[&signer_seeds[..]],
        ),
        params.amount,
        params.other_amount_threshold,
        params.sqrt_price_limit,
        params.amount_specified_is_input,
        params.a_to_b,
    )?;

    Ok(())
}
