defmodule WaspExTest do
  use ExUnit.Case
  doctest WaspEx

  test "greets the world" do
    assert WaspEx.hello() == :world
  end
end
