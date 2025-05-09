use {
  crate::{error::ErrorCode, permission::verify_permission, state::*},
  anchor_lang::prelude::*,
  anchor_spl::{associated_token::AssociatedToken, token_interface::{TokenAccount, TokenInterface}},
  whirlpool_cpi::{self, program::Whirlpool as WhirlpoolProgram, state::*},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct OrcaOpenPositionParams {
  tick_lower_index: i32,
  tick_upper_index: i32,
  liquidity_amount: u128,
  token_max_a: u64,
  token_max_b: u64,
}

#[derive(Accounts)]
pub struct OpenPosition<'info> {
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
  )]
  pub order: Box<Account<'info, Order>>,
  #[account(
      mut,
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
  pub tick_array_lower: UncheckedAccount<'info>,
  #[account(mut)]
  /// CHECK: checked by whirlpool_program
  pub tick_array_upper: UncheckedAccount<'info>,

  pub whirlpool_program: Program<'info, WhirlpoolProgram>,
  pub token_program: Interface<'info, TokenInterface>,
  pub system_program: Program<'info, System>,
  pub rent: Sysvar<'info, Rent>,
  pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler(
  ctx: Context<OpenPosition>,
  params: OrcaOpenPositionParams,
) -> Result<()> {
  let manager = &ctx.accounts.manager;
  let signer = &ctx.accounts.signer;
  let manager_vault_a = &ctx.accounts.manager_vault_a;
  let manager_vault_b = &ctx.accounts.manager_vault_b;

  // Verify permissions at the beginning
  verify_permission(signer, manager_vault_a, manager_vault_b, manager, false)?;

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
    params.tick_lower_index,
    params.tick_upper_index,
  )?;

  msg!("Increasing liquidity");

  whirlpool_cpi::cpi::increase_liquidity(
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
        &[&[
          b"manager".as_ref(),
          manager.project.as_ref(),
          manager.authority.as_ref(),
          &[manager.bump],
      ]],
    ),
    params.liquidity_amount,
    params.token_max_a,
    params.token_max_b,
  )?;

  Ok(())
}