use anchor_lang::error_code;

#[error_code]
pub enum ErrorCode {
    #[msg("Jupiter program is not the expected one")]
    JupiterProgramNotExpected,
    #[msg("Signer has no permission to perform this action")]
    IncorrectSigner,
    #[msg("You are providing an incorrect mint")]
    IncorrectMint,
}