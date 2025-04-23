use {
  crate::state::*,
  crate::error::ErrorCode,
  anchor_lang::prelude::*,
  anchor_spl::token_interface::{TokenInterface, TokenAccount},
  whirlpool_cpi::{program::Whirlpool as WhirlpoolProgram, state::{Whirlpool, TickArray, Position}},
};

#[derive(Accounts)]
pub struct DecreaseLiquidity<'info> {
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
      bump = order.bump,
      constraint = order.manager == manager.key() @ErrorCode::IncorrectManager,
  )]
  pub order: Box<Account<'info, Order>>,
  #[account(
      mut,
      seeds = [
          b"manager".as_ref(),
          manager.project.as_ref(),
          manager.authority.as_ref(),
      ],
      bump = manager.bump,
      constraint = (manager.delegate == signer.key() || manager.authority == signer.key()) @ErrorCode::IncorrectSigner
  )]
  pub manager: Box<Account<'info, Manager>>,

  #[account(mut)]
  pub whirlpool: Account<'info, Whirlpool>,

  #[account(mut, has_one = whirlpool)]
  pub position: Account<'info, Position>,
  #[account(
      constraint = position_token_account.mint == position.position_mint,
      constraint = position_token_account.amount == 1
  )]
  pub position_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

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

  #[account(mut, has_one = whirlpool)]
  pub tick_array_lower: AccountLoader<'info, TickArray>,
  #[account(mut, has_one = whirlpool)]
  pub tick_array_upper: AccountLoader<'info, TickArray>,

  pub whirlpool_program: Program<'info, WhirlpoolProgram>,
  pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
  ctx: Context<DecreaseLiquidity>,
  liquidity_amount: u128,
  token_min_a: u64,
  token_min_b: u64,
) -> Result<()> {
  let manager = &ctx.accounts.manager;
  let signer_seeds = &[
      b"manager".as_ref(),
      manager.project.as_ref(),
      manager.authority.as_ref(),
      &[manager.bump],
  ];

  whirlpool_cpi::cpi::decrease_liquidity(
    CpiContext::new_with_signer(
        ctx.accounts.whirlpool_program.to_account_info(),
        whirlpool_cpi::cpi::accounts::ModifyLiquidity {
          whirlpool: ctx.accounts.whirlpool.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
          position_authority: ctx.accounts.manager.to_account_info(),
          position: ctx.accounts.position.to_account_info(),
          position_token_account: ctx.accounts.position_token_account.to_account_info(),
          token_owner_account_a: ctx.accounts.manager_vault_a.to_account_info(),
          token_owner_account_b: ctx.accounts.manager_vault_b.to_account_info(),
          token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
          token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
          tick_array_lower: ctx.accounts.tick_array_lower.to_account_info(),
          tick_array_upper: ctx.accounts.tick_array_upper.to_account_info(),
        },
        &[&signer_seeds[..]],
    ),
    liquidity_amount,
    token_min_a,
    token_min_b,
  )?;

  Ok(())
}