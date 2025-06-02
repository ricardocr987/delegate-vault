use anchor_lang::error_code;

#[error_code]
pub enum ErrorCode {
    #[msg("Jupiter program is not the expected one")]
    JupiterProgramNotExpected,
    #[msg("Signer has no permission to perform this action")]
    IncorrectSigner,
    #[msg("You are providing an incorrect mint")]
    IncorrectMint,
    #[msg("You are providing an incorrect owner")]
    IncorrectOwner,
    #[msg("Numerical overflow occurred during calculation")]
    NumericalOverflow,
    #[msg("Performance fee is too high")]
    IncorrectFee,
    #[msg("Incorrect project")]
    IncorrectProject,
    #[msg("Incorrect manager")]
    IncorrectManager,
    #[msg("Delegate is not allowed")]
    DelegateNotAllowed,
    #[msg("Invalid remaining accounts provided")]
    InvalidRemainingAccounts,
    #[msg("Invalid token program provided")]
    InvalidTokenProgram,
    #[msg("Duplicate mints not allowed")]
    DuplicateMints,
    #[msg("Invalid source token account")]
    InvalidSourceTokenAccount,
    #[msg("Invalid destination token account")]
    InvalidDestinationTokenAccount,
    #[msg("Invalid transfer authority")]
    InvalidTransferAuthority,
    #[msg("Invalid Jupiter route instruction")]
    InvalidJupiterRoute,
    #[msg("Order vault is empty")]
    EmptyOrderVault,
    #[msg("Incorrect config")]
    IncorrectConfig,
    #[msg("Incorrect payment receiver")]
    IncorrectReceiver,
    #[msg("Incorrect payment mint")]
    IncorrectPaymentMint,
    #[msg("Payment amount must be either monthly (49 USDC) or yearly (499 USDC)")]
    IncorrectPaymentAmount,
    #[msg("Arithmetic overflow occurred")]
    ArithmeticOverflow,
    #[msg("Incorrect order vault")]
    IncorrectOrderVault,
}