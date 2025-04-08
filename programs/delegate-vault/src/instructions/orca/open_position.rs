use {
  crate::state::*,
  crate::error::ErrorCode,
  anchor_lang::prelude::*,
  anchor_spl::{associated_token::AssociatedToken, token_interface::TokenInterface},
  whirlpool_cpi::{self, state::*, program::Whirlpool as WhirlpoolProgram},
};

#[derive(Accounts)]
pub struct OpenPosition<'info> {
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

  /// CHECK: init by whirlpool
  #[account(mut)]
  pub position: UncheckedAccount<'info>,

  /// CHECK: init by whirlpool
  #[account(mut)]
  pub position_mint: Signer<'info>,

  /// CHECK: init by whirlpool
  #[account(mut)]
  pub position_token_account: UncheckedAccount<'info>,

  pub whirlpool: Box<Account<'info, Whirlpool>>,

  pub whirlpool_program: Program<'info, WhirlpoolProgram>,
  pub token_program: Interface<'info, TokenInterface>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(
  ctx: Context<OpenPosition>,
  tick_lower_index: i32,
  tick_upper_index: i32,
) -> Result<()> {
  let manager = &ctx.accounts.manager;
  let signer_seeds = &[
      b"manager".as_ref(),
      manager.project.as_ref(),
      manager.authority.as_ref(),
      &[manager.bump],
  ];

  whirlpool_cpi::cpi::open_position(
    CpiContext::new_with_signer(
      ctx.accounts.whirlpool_program.to_account_info(),
      whirlpool_cpi::cpi::accounts::OpenPosition {
        funder: ctx.accounts.signer.to_account_info(),
        owner: ctx.accounts.manager.to_account_info(),
        position: ctx.accounts.position.to_account_info(),
        position_mint: ctx.accounts.position_mint.to_account_info(),
        position_token_account: ctx.accounts.position_token_account.to_account_info(),
        whirlpool: ctx.accounts.whirlpool.to_account_info(),
        token_program: ctx.accounts.token_program.to_account_info(),
        system_program: ctx.accounts.system_program.to_account_info(),
        rent: ctx.accounts.rent.to_account_info(),
        associated_token_program: ctx.accounts.associated_token_program.to_account_info(),
      },
      &[&signer_seeds[..]],
    ),
    whirlpool_cpi::state::OpenPositionBumps { position_bump: 0 }, // passed bump is no longer used
    tick_lower_index,
    tick_upper_index,
  )?;

  Ok(())
}