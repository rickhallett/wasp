import Config

# Runtime configuration from environment variables

config :wasp,
  api_token: System.get_env("WASP_API_TOKEN"),
  port: String.to_integer(System.get_env("WASP_PORT") || "3847")

if config_env() == :prod do
  database_url =
    System.get_env("DATABASE_URL") ||
      raise """
      environment variable DATABASE_URL is missing.
      For example: ecto://USER:PASS@HOST/DATABASE
      """

  config :wasp, Wasp.Repo,
    url: database_url,
    pool_size: String.to_integer(System.get_env("POOL_SIZE") || "10")
end
