#!/usr/bin/env bun

import * as core from "@actions/core";
import { preparePrompt } from "./prepare-prompt";
import { runClaude } from "./run-claude";
import { validateEnvironmentVariables } from "./validate-env";
import { setupOAuthCredentials } from "./setup-oauth";
import { validateOAuthTokens, getRemainingTokenTime } from "./oauth/token-validator";
import { validateTokensWithRefreshGuidance, setupTokenRefreshAutomation } from "./oauth/token-auto-refresh";

async function run() {
  try {
    validateEnvironmentVariables();

    // Setup OAuth credentials if using OAuth authentication
    if (process.env.CLAUDE_CODE_USE_OAUTH === "1") {
      // First validate the tokens before setting them up
      try {
        const tokenInfo = validateOAuthTokens();
        
        // Use smart validation with refresh guidance
        validateTokensWithRefreshGuidance(
          tokenInfo.accessToken,
          tokenInfo.refreshToken,
          tokenInfo.expiresAt
        );
        
        const remainingTime = getRemainingTokenTime(tokenInfo.expiresAt);
        console.log(`✅ OAuth token validated. Remaining time: ${remainingTime}`);
        
        // Optionally setup automation if tokens are expiring soon
        const hoursRemaining = (parseInt(tokenInfo.expiresAt) - Date.now()) / (1000 * 60 * 60);
        if (hoursRemaining < 72) {
          try {
            await setupTokenRefreshAutomation();
          } catch (e) {
            // Non-critical, just log
            core.info("Could not setup token refresh automation");
          }
        }
        
        // Only setup credentials if tokens are valid
        await setupOAuthCredentials({
          accessToken: tokenInfo.accessToken,
          refreshToken: tokenInfo.refreshToken,
          expiresAt: tokenInfo.expiresAt,
        });
      } catch (error) {
        core.setFailed(`OAuth token validation failed: ${error}`);
        core.setOutput("conclusion", "failure");
        process.exit(1);
      }
    }

    const promptConfig = await preparePrompt({
      prompt: process.env.INPUT_PROMPT || "",
      promptFile: process.env.INPUT_PROMPT_FILE || "",
    });

    await runClaude(promptConfig.path, {
      allowedTools: process.env.INPUT_ALLOWED_TOOLS,
      disallowedTools: process.env.INPUT_DISALLOWED_TOOLS,
      maxTurns: process.env.INPUT_MAX_TURNS,
      mcpConfig: process.env.INPUT_MCP_CONFIG,
    });
  } catch (error) {
    core.setFailed(`Action failed with error: ${error}`);
    core.setOutput("conclusion", "failure");
    process.exit(1);
  }
}

if (import.meta.main) {
  run();
}
