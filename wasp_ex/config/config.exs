import Config

config :wasp,
  ecto_repos: [Wasp.Repo],
  port: 3847

# Import environment specific config
import_config "#{config_env()}.exs"
