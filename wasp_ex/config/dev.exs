import Config

# SQLite for development
config :wasp, :ecto_adapter, Ecto.Adapters.SQLite3

config :wasp, Wasp.Repo,
  database: Path.expand("~/.wasp_ex/wasp_dev.db"),
  pool_size: 5,
  stacktrace: true,
  show_sensitive_data_on_connection_error: true

# Logging
config :logger, :console, format: "[$level] $message\n"
