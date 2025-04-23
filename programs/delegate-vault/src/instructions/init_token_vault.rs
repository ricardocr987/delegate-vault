use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
    anchor_spl::token_interface::{Mint, TokenInterface, TokenAccount},
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
pub struct InitTokenVault<'info> {
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

    pub mint: Box<InterfaceAccount<'info, Mint>>,

    #[account(
        init,
        payer = signer,
        seeds = [
            b"token_vault".as_ref(),
            signer.key().as_ref(),
            manager.key().as_ref(),
            order.key().as_ref(),
            mint.key().as_ref(),
        ],
        bump,
        token::mint = mint,
        token::authority = manager, 
        token::token_program = token_program,
    )]
    pub token_vault: InterfaceAccount<'info, TokenAccount>,

    pub token_program: Interface<'info, TokenInterface>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(_ctx: Context<InitTokenVault>) -> Result<()> {
    Ok(())
}
