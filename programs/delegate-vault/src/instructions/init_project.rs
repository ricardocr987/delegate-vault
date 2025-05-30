use {
    crate::state::*,
    anchor_lang::prelude::*,
    crate::error::ErrorCode,
    anchor_spl::{associated_token::AssociatedToken, token_interface::{Mint, TokenInterface, TokenAccount}},
};

#[derive(Accounts)]
pub struct InitProject<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        init,
        space = Project::LEN,
        payer = signer,
        seeds = [
            b"project".as_ref(),
            signer.key().as_ref(),
        ],
        bump,
    )]
    pub project: Box<Account<'info, Project>>,
    pub sol_mint: Box<InterfaceAccount<'info, Mint>>,
    pub usdc_mint: Box<InterfaceAccount<'info, Mint>>,
    #[account(
        init_if_needed, 
        payer = signer, 
        associated_token::mint = sol_mint, 
        associated_token::authority = project, 
        associated_token::token_program = token_program, 
    )]
    pub sol_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    #[account(
        init_if_needed, 
        payer = signer, 
        associated_token::mint = usdc_mint, 
        associated_token::authority = project, 
        associated_token::token_program = token_program, 
    )]
    pub usdc_vault: Box<InterfaceAccount<'info, TokenAccount>>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
    pub token_program: Interface<'info, TokenInterface>,
    pub associated_token_program: Program<'info, AssociatedToken>,
}

pub fn handler<'info>(ctx: Context<InitProject>, performance_fee: u16) -> Result<()> {
    if performance_fee > 10000 {
        return Err(ErrorCode::IncorrectFee.into());
    }

    let project = &mut ctx.accounts.project;

    project.authority = ctx.accounts.signer.key();
    project.performance_fee = performance_fee;
    project.bump = ctx.bumps.project;
    
    Ok(())
}
