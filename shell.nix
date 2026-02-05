let
  pkgs = import <nixpkgs> { };

  buildInputs = with pkgs; [
    # Node tooling
    nodejs_24

    p7zip
    unar # For unpacking RAR and other archive formats
  ];
in
pkgs.mkShell {
  inherit buildInputs;
  LD_LIBRARY_PATH = pkgs.lib.makeLibraryPath buildInputs;
  shellHook = ''
    echo "Node: $(node --version)"
    echo "npm:  $(npm --version)"

    # When building native Electron modules, use Electron headers matching our electron version
    export npm_config_runtime=electron
    export npm_config_target=35.0.0
    export npm_config_disturl=https://electronjs.org/headers

    export USE_SYSTEM_7ZA=true

    export ELECTRON_BINARY="$PWD/.electron"
    cat > "$ELECTRON_BINARY" <<'EOF'
    #!/usr/bin/env bash
    export LD_LIBRARY_PATH=${pkgs.lib.makeLibraryPath buildInputs}
    export USE_SYSTEM_7ZA=true
    exec "${pkgs.electron}/bin/electron" "$@" "--enable-features=UseOzonePlatform" "--ozone-platform=x11"
    EOF
    chmod +x "$ELECTRON_BINARY"
  '';
}
