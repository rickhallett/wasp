defmodule Wasp do
  @moduledoc """
  Wasp - Security whitelist layer for AI agents.

  Protects agentic AI systems from prompt injection attacks by:
  - Maintaining a whitelist of trusted contacts
  - Filtering messages from unknown sources
  - Gating tool access based on trust levels

  Trust Levels:
  - :sovereign - Full access, can modify whitelist
  - :trusted   - All tools allowed
  - :limited   - Read-only, dangerous tools blocked
  """
end
