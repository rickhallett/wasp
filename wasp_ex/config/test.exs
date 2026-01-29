import Config

# SQLite for tests (in-memory or temp file)
config :wasp, :ecto_adapter, Ecto.Adapters.SQLite3

config :wasp, Wasp.Repo,
  database: ":memory:",
  pool: Ecto.Adapters.SQL.Sandbox,
  pool_size: 10

# Quieter logging during tests
config :logger, level: :warning
