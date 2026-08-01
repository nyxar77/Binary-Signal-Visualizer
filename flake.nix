{
  description = "Development shell for the Binary Signal Visualizer";

  inputs.nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";

  outputs = { self, nixpkgs }:
    let
      systems = [ "x86_64-linux" "aarch64-linux" "x86_64-darwin" "aarch64-darwin" ];
      forEachSystem = f:
        builtins.listToAttrs (map (system: {
          name = system;
          value = f (import nixpkgs { inherit system; });
        }) systems);
    in {
      devShells = forEachSystem (pkgs: {
        default = pkgs.mkShell {
          packages = [ pkgs.bun ];
        };
      });
    };
}
