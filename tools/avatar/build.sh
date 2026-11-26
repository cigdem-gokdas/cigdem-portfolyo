#!/bin/sh
# Avatarı baştan üretir: Blender+MPFB → ham GLB → iskelet ekseni düzeltmesi → sıkıştırma → assets/avatar.glb
set -e
cd "$(dirname "$0")/../.."
mkdir -p tools/avatar/out
blender -b -P tools/avatar/build_avatar.py -- --config tools/avatar/cigdem.json --export tools/avatar/out/raw.glb "$@" | grep -E "^(MESH|HAIRFADE)|Error|Traceback" || true
python3 tools/avatar/fix_skeleton.py tools/avatar/out/raw.glb tools/avatar/out/fixed.glb
npx -y @gltf-transform/cli@4 optimize tools/avatar/out/fixed.glb assets/avatar.glb --compress meshopt --texture-compress webp --texture-size 1024 --simplify false --join false --instance false --flatten false --palette false | tail -1
