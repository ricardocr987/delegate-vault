use {
    crate::state::*,
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
pub struct InitManager<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    /// CHECK: delegate is a system account that will be authorized to perform liquidations
    pub delegate: SystemAccount<'info>,
    #[account(
        init,
        space = Manager::LEN,
        payer = signer,
        seeds = [
            b"manager".as_ref(),
            signer.key().as_ref(),
        ],
        bump,
    )]
    pub manager: Box<Account<'info, Manager>>,
    pub rent: Sysvar<'info, Rent>,
    pub system_program: Program<'info, System>,
}

pub fn handler<'info>(ctx: Context<InitManager>) -> Result<()> {
    let manager = &mut ctx.accounts.manager;

    manager.authority = ctx.accounts.signer.key();
    manager.delegate = ctx.accounts.delegate.key();
    manager.end_subscription = 0; // Initialize with no subscription
    manager.bump = ctx.bumps.manager;
    
    Ok(())
}
