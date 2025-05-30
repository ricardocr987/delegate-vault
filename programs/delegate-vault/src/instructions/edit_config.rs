use {
    crate::state::*,
    crate::error::ErrorCode,
    anchor_lang::prelude::*,
};

#[derive(Accounts)]
pub struct EditConfig<'info> {
    #[account(mut)]
    pub signer: Signer<'info>,
    #[account(
        mut,
        seeds = [
            b"config".as_ref(),
        ],
        bump = config.bump,
        constraint = signer.key() == config.authority 
            @ ErrorCode::IncorrectSigner,
    )]
    pub config: Box<Account<'info, Config>>,
}

pub fn handler<'info>(
    ctx: Context<EditConfig>, 
    performance_fee: u16,
) -> Result<()> {
    if performance_fee > 10000 {
        return Err(ErrorCode::IncorrectFee.into());
    }

    (*ctx.accounts.config).performance_fee = performance_fee;

    Ok(())
}