use {
    crate::state::*,
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
pub struct InitManager<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    pub delegate: SystemAccount<'info>,
    #[account(
        init,
        space = Manager::LEN,
        payer = signer,
        seeds = [
            b"manager".as_ref(),
            project.key().as_ref(),
            signer.key().as_ref(),
        ],
        bump,
    )]
    pub manager: Box<Account<'info, Manager>>,
    pub project: Box<Account<'info, Project>>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(ctx: Context<InitManager>) -> Result<()> {
    let manager = &mut ctx.accounts.manager;

    manager.project = ctx.accounts.project.key();
    manager.authority = ctx.accounts.signer.key();
    manager.delegate = ctx.accounts.delegate.key();
    manager.bump = ctx.bumps.manager;
    
    Ok(())
}
