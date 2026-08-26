{
  description = "capacities-cli development shell";

  inputs = {
    nixpkgs.url = "github:NixOS/nixpkgs/nixos-unstable";
    flake-utils.url = "github:numtide/flake-utils";
  };

  outputs =
    {
      self,
      nixpkgs,
      flake-utils,
    }:
    flake-utils.lib.eachDefaultSystem (
      system:
      let
        pkgs = import nixpkgs { inherit system; };
      in
      {
        devShells.default = pkgs.mkShell {
          packages = with pkgs; [
            nodejs_24
            pre-commit
            gitleaks
            semgrep
            trivy
          ];

          shellHook = ''
            mkdir -p .tool-cache/semgrep-config .tool-cache/docker-empty-config .tool-cache/trivy
            pre-commit install --install-hooks >/dev/null 2>&1 || true
          '';
        };
      }
    );
}
