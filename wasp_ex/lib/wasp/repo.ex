defmodule Wasp.Repo do
  use Ecto.Repo,
    otp_app: :wasp,
    adapter: Application.compile_env(:wasp, :ecto_adapter, Ecto.Adapters.SQLite3)
end
