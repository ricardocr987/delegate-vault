use {
  crate::state::*,
  crate::error::ErrorCode,
  crate::permission::verify_permission,
  anchor_lang::prelude::*,
  anchor_spl::token_interface::{TokenInterface, TokenAccount, Mint},
  whirlpool_cpi::{program::Whirlpool as WhirlpoolProgram, state::{Position, Whirlpool}},
};

#[derive(AnchorSerialize, AnchorDeserialize)]
pub struct OrcaClosePositionParams {
  liquidity_amount: u128,
  token_min_a: u64,
  token_min_b: u64,
  reward_index: Option<u8>
}

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
          manager.authority.as_ref(),
      ],
      bump = manager.bump,
      constraint = manager.delegate == signer.key() || manager.authority == signer.key()
        @ErrorCode::IncorrectSigner
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
}

pub fn handler(
  ctx: Context<ClosePosition>,
  params: OrcaClosePositionParams,
) -> Result<()> {
  let manager = &ctx.accounts.manager;
  let signer = &ctx.accounts.signer;
  let manager_vault_a: &Box<InterfaceAccount<'_, TokenAccount>> = &ctx.accounts.manager_vault_a;
  let manager_vault_b = &ctx.accounts.manager_vault_b;

  // Verify permissions at the beginning
  verify_permission(signer, manager_vault_a, manager_vault_b, manager, false)?;

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
    params.liquidity_amount,
    params.token_min_a,
    params.token_min_b,
  )?;

  if params.reward_index.is_some() {
    whirlpool_cpi::cpi::collect_reward(
      CpiContext::new_with_signer(
          ctx.accounts.whirlpool_program.to_account_info(),
          whirlpool_cpi::cpi::accounts::CollectReward {
            whirlpool: ctx.accounts.whirlpool.to_account_info(),
            position_authority: ctx.accounts.manager.to_account_info(),
            position: ctx.accounts.position.to_account_info(),
            position_token_account: ctx.accounts.position_token_account.to_account_info(),
            reward_owner_account: ctx.accounts.manager.to_account_info(),
            reward_vault: ctx.accounts.manager_vault_a.to_account_info(),
            token_program: ctx.accounts.token_program.to_account_info(),
          },
          &[&signer_seeds[..]],
      ),
      params.reward_index.unwrap()
    )?;
  }
  
  whirlpool_cpi::cpi::collect_fees(
    CpiContext::new_with_signer(
        ctx.accounts.whirlpool_program.to_account_info(),
        whirlpool_cpi::cpi::accounts::CollectFees {
          whirlpool: ctx.accounts.whirlpool.to_account_info(),
          position_authority: ctx.accounts.manager.to_account_info(),
          position: ctx.accounts.position.to_account_info(),
          position_token_account: ctx.accounts.position_token_account.to_account_info(),
          token_owner_account_a: ctx.accounts.manager_vault_a.to_account_info(),
          token_vault_a: ctx.accounts.token_vault_a.to_account_info(),
          token_owner_account_b: ctx.accounts.manager_vault_b.to_account_info(),
          token_vault_b: ctx.accounts.token_vault_b.to_account_info(),
          token_program: ctx.accounts.token_program.to_account_info(),
        },
        &[&signer_seeds[..]],
    ),
  )?;

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