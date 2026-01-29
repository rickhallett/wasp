defmodule Wasp.Application do
  @moduledoc false

  use Application

  @impl true
  def start(_type, _args) do
    children = [
      # Database connection pool
      Wasp.Repo

      # GenServers added in Phase 4:
      # Wasp.SessionStore,
      # Wasp.RateLimiter,

      # HTTP server added in Phase 5:
      # {Bandit, plug: Wasp.Router, port: port()}
    ]

    opts = [strategy: :one_for_one, name: Wasp.Supervisor]
    Supervisor.start_link(children, opts)
  end

  # defp port do
  #   Application.get_env(:wasp, :port, 3847)
  # end
end
