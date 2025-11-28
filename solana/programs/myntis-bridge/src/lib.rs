use anchor_lang::prelude::*;
use anchor_spl::token::{self, Mint, Token, TokenAccount, Transfer};

declare_id!("MyntisBridge1111111111111111111111111111111");

#[program]
pub mod myntis_bridge {
    use super::*;

    /// Initialize the bridge with SPL token mint
    pub fn initialize(ctx: Context<Initialize>, mint: Pubkey) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;
        bridge.mint = mint;
        bridge.authority = ctx.accounts.authority.key();
        bridge.total_locked = 0;
        bridge.total_minted = 0;
        Ok(())
    }

    /// Mint tokens from EVM bridge (called by bridge authority)
    pub fn mint_from_bridge(
        ctx: Context<MintFromBridge>,
        amount: u64,
        evm_tx_hash: [u8; 32],
    ) -> Result<()> {
        let bridge = &ctx.accounts.bridge;
        
        // Verify authority
        require!(
            ctx.accounts.authority.key() == bridge.authority,
            BridgeError::Unauthorized
        );

        // Verify transaction hash hasn't been used (prevent replay)
        // In production, store used hashes in account data
        
        // Mint tokens to recipient
        let seeds = &[
            b"bridge",
            ctx.accounts.bridge.to_account_info().key.as_ref(),
            &[ctx.bumps.bridge],
        ];
        let signer = &[&seeds[..]];

        token::mint_to(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::MintTo {
                    mint: ctx.accounts.mint.to_account_info(),
                    to: ctx.accounts.recipient.to_account_info(),
                    authority: ctx.accounts.bridge.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Update bridge state
        bridge.total_minted = bridge.total_minted
            .checked_add(amount)
            .ok_or(BridgeError::Overflow)?;

        emit!(MintEvent {
            recipient: ctx.accounts.recipient.key(),
            amount,
            evm_tx_hash,
        });

        Ok(())
    }

    /// Burn tokens for EVM bridge (called by user)
    pub fn burn_for_bridge(
        ctx: Context<BurnForBridge>,
        amount: u64,
        evm_recipient: [u8; 20], // Ethereum address (20 bytes)
    ) -> Result<()> {
        // Transfer tokens from user to bridge (burn authority)
        let seeds = &[
            b"bridge",
            ctx.accounts.bridge.to_account_info().key.as_ref(),
            &[ctx.bumps.bridge],
        ];
        let signer = &[&seeds[..]];

        token::transfer(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                Transfer {
                    from: ctx.accounts.user_token_account.to_account_info(),
                    to: ctx.accounts.bridge_token_account.to_account_info(),
                    authority: ctx.accounts.user.to_account_info(),
                },
                &[],
            ),
            amount,
        )?;

        // Burn tokens
        token::burn(
            CpiContext::new_with_signer(
                ctx.accounts.token_program.to_account_info(),
                token::Burn {
                    mint: ctx.accounts.mint.to_account_info(),
                    from: ctx.accounts.bridge_token_account.to_account_info(),
                    authority: ctx.accounts.bridge.to_account_info(),
                },
                signer,
            ),
            amount,
        )?;

        // Update bridge state
        let bridge = &mut ctx.accounts.bridge;
        bridge.total_locked = bridge.total_locked
            .checked_add(amount)
            .ok_or(BridgeError::Overflow)?;

        emit!(BurnEvent {
            user: ctx.accounts.user.key(),
            amount,
            evm_recipient,
        });

        Ok(())
    }

    /// Update bridge authority (only current authority)
    pub fn update_authority(ctx: Context<UpdateAuthority>, new_authority: Pubkey) -> Result<()> {
        let bridge = &mut ctx.accounts.bridge;
        require!(
            ctx.accounts.authority.key() == bridge.authority,
            BridgeError::Unauthorized
        );
        bridge.authority = new_authority;
        Ok(())
    }
}

#[derive(Accounts)]
pub struct Initialize<'info> {
    #[account(
        init,
        payer = authority,
        space = 8 + Bridge::LEN,
        seeds = [b"bridge"],
        bump
    )]
    pub bridge: Account<'info, Bridge>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub authority: Signer<'info>,
    pub system_program: Program<'info, System>,
}

#[derive(Accounts)]
pub struct MintFromBridge<'info> {
    #[account(
        seeds = [b"bridge"],
        bump = bridge.bump,
        has_one = mint @ BridgeError::InvalidMint
    )]
    pub bridge: Account<'info, Bridge>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub recipient: Account<'info, TokenAccount>,
    pub authority: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct BurnForBridge<'info> {
    #[account(
        seeds = [b"bridge"],
        bump = bridge.bump,
        has_one = mint @ BridgeError::InvalidMint
    )]
    pub bridge: Account<'info, Bridge>,
    pub mint: Account<'info, Mint>,
    #[account(mut)]
    pub user_token_account: Account<'info, TokenAccount>,
    #[account(
        mut,
        seeds = [b"bridge", b"token"],
        bump,
        token::mint = mint,
        token::authority = bridge
    )]
    pub bridge_token_account: Account<'info, TokenAccount>,
    #[account(mut)]
    pub user: Signer<'info>,
    pub token_program: Program<'info, Token>,
}

#[derive(Accounts)]
pub struct UpdateAuthority<'info> {
    #[account(
        seeds = [b"bridge"],
        bump = bridge.bump,
        has_one = authority @ BridgeError::Unauthorized
    )]
    pub bridge: Account<'info, Bridge>,
    pub authority: Signer<'info>,
}

#[account]
pub struct Bridge {
    pub mint: Pubkey,
    pub authority: Pubkey,
    pub total_locked: u64,
    pub total_minted: u64,
    pub bump: u8,
}

impl Bridge {
    pub const LEN: usize = 32 + 32 + 8 + 8 + 1; // mint + authority + total_locked + total_minted + bump
}

#[event]
pub struct MintEvent {
    pub recipient: Pubkey,
    pub amount: u64,
    pub evm_tx_hash: [u8; 32],
}

#[event]
pub struct BurnEvent {
    pub user: Pubkey,
    pub amount: u64,
    pub evm_recipient: [u8; 20],
}

#[error_code]
pub enum BridgeError {
    #[msg("Unauthorized")]
    Unauthorized,
    #[msg("Invalid mint")]
    InvalidMint,
    #[msg("Overflow")]
    Overflow,
}

