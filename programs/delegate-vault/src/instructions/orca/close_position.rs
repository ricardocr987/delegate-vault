use {
  crate::state::*,
  crate::error::ErrorCode,
  anchor_lang::prelude::*,
  anchor_spl::token_interface::{TokenInterface, TokenAccount, Mint},
  whirlpool_cpi::{program::Whirlpool as WhirlpoolProgram, state::Position},
};

#[derive(Accounts)]
pub struct ClosePosition<'info> {
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
      bump = order.bump,
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

  /// CHECK: safe (the account to receive the remaining balance of the closed account)
  #[account(
    mut,
    constraint = receiver.key() == manager.authority @ErrorCode::IncorrectOwner
  )]
  pub receiver: UncheckedAccount<'info>,

  #[account(mut)]
  pub position: Account<'info, Position>,

  #[account(mut, address = position.position_mint)]
  pub position_mint: Box<InterfaceAccount<'info, Mint>>,

  #[account(mut,
      constraint = position_token_account.amount == 1,
      constraint = position_token_account.mint == position.position_mint)]
  pub position_token_account: Box<InterfaceAccount<'info, TokenAccount>>,

  pub whirlpool_program: Program<'info, WhirlpoolProgram>,
  pub token_program: Interface<'info, TokenInterface>,
}

pub fn handler(
  ctx: Context<ClosePosition>,
) -> Result<()> {
  let manager = &ctx.accounts.manager;
  let signer_seeds = &[
      b"manager".as_ref(),
      manager.project.as_ref(),
      manager.authority.as_ref(),
      &[manager.bump],
  ];

  whirlpool_cpi::cpi::close_position(
    CpiContext::new_with_signer(
        ctx.accounts.whirlpool_program.to_account_info(),
        whirlpool_cpi::cpi::accounts::ClosePosition {
          position_authority: ctx.accounts.manager.to_account_info(),
          receiver: ctx.accounts.receiver.to_account_info(),
          position: ctx.accounts.position.to_account_info(),
          position_mint: ctx.accounts.position_mint.to_account_info(),
          position_token_account: ctx.accounts.position_token_account.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
        },
        &[&signer_seeds[..]],
    ),
  )?;

  Ok(())
}