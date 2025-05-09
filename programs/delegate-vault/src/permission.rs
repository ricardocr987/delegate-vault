use {
    crate::{error::ErrorCode, state::*},
    anchor_lang::prelude::*,
    anchor_spl::token_interface::TokenAccount,
};

// Jupiter instruction discriminators
pub const JUPITER_ROUTE_DISCRIMINATOR: [u8; 8] = [229, 23, 203, 151, 122, 227, 173, 42];
pub const JUPITER_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR: [u8; 8] = [150, 86, 71, 116, 167, 93, 14, 104];
pub const JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR: [u8; 8] = [208, 51, 239, 151, 123, 43, 237, 92];
pub const JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR: [u8; 8] = [193, 32, 155, 51, 65, 214, 156, 129];
pub const JUPITER_SHARED_ACCOUNTS_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR: [u8; 8] = [230, 121, 143, 80, 119, 159, 106, 170];
pub const JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR: [u8; 8] = [176, 209, 105, 168, 154, 125, 69, 62];

/// Checks if the given data contains a Jupiter instruction discriminator
pub fn is_jupiter_instruction(data: &[u8]) -> bool {
    if data.len() < 8 {
        return false;
    }

    let discriminator = &data[0..8];
    discriminator == JUPITER_ROUTE_DISCRIMINATOR
        || discriminator == JUPITER_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR
        || discriminator == JUPITER_EXACT_OUT_ROUTE_DISCRIMINATOR
        || discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_DISCRIMINATOR
        || discriminator == JUPITER_SHARED_ACCOUNTS_ROUTE_WITH_TOKEN_LEDGER_DISCRIMINATOR
        || discriminator == JUPITER_SHARED_ACCOUNTS_EXACT_OUT_ROUTE_DISCRIMINATOR
}

pub fn verify_permission(
    signer: &Signer<'_>,
    deposit_vault: &InterfaceAccount<'_, TokenAccount>,
    token_vault: &InterfaceAccount<'_, TokenAccount>,
    manager: &Account<Manager>,
    is_liquidate: bool,
) -> Result<()> {
    if signer.key() == manager.authority {
        return Ok(());
    }

    // Check if deposit vault authority is the manager key
    if deposit_vault.owner != manager.key() {
        return Err(ErrorCode::IncorrectOwner.into());
    }

    // Check if token vault authority is the manager key
    if token_vault.owner != manager.key() {
        return Err(ErrorCode::IncorrectOwner.into());
    }

    // Check if signer is either manager.authority or delegate
    if signer.key() != manager.authority && signer.key() != manager.delegate {
        return Err(ErrorCode::IncorrectSigner.into());
    }

    // If signer is delegate, check delegate_flag
    if signer.key() != manager.authority {
        if signer.key() != manager.delegate {
            return Err(ErrorCode::IncorrectSigner.into());
        } else {
            if !is_liquidate {
                return Err(ErrorCode::DelegateNotAllowed.into());
            }
        }
    }

    Ok(())
}

pub fn verify_deposit_mint(
    deposit_mint: &Pubkey,
    token_vault_a: &InterfaceAccount<'_, TokenAccount>,
    token_vault_b: &InterfaceAccount<'_, TokenAccount>,
    order: &Account<Order>,
) -> Result<()> {
    // Check if deposit mint is present either as mint_a or mint_b
    if token_vault_a.mint != *deposit_mint && token_vault_b.mint != *deposit_mint {
        return Err(ErrorCode::IncorrectMint.into());
    }

    if order.deposit_mint != *deposit_mint {
        return Err(ErrorCode::IncorrectMint.into());
    }

    Ok(())
}