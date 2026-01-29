import Config

# Postgres for production
config :wasp, :ecto_adapter, Ecto.Adapters.Postgres

# Actual database URL configured in runtime.exs
config :wasp, Wasp.Repo,
  pool_size: 10

config :logger, level: :info
