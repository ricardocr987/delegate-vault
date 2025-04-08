use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
pub struct EditProjectFee<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            b"project".as_ref(),
            signer.key().as_ref(),
        ],
        bump = project.bump,
        constraint = signer.key() == project.authority 
            @ ErrorCode::IncorrectSigner,
    )]
    pub project: Box<Account<'info, Project>>,
}

pub fn handler<'info>(
    ctx: Context<EditProjectFee>, 
    performance_fee: u16,
) -> Result<()> {
    if performance_fee > 10000 {
        return Err(ErrorCode::IncorrectFee.into());
    }

    (*ctx.accounts.project).performance_fee = performance_fee;
    
    Ok(())
}