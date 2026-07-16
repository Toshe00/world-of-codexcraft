# src/assets/: Asset replacement control plane

This directory owns presentation-only asset path resolution. It must stay independent of
the simulation, DOM, Three.js, networking, storage, and player-controlled state.

- `asset_replacement.mjs` is the pure validation and resolution core shared by Vitest and
  the read-only Node verifier.
- `runtime.ts` is the thin Vite adapter. Laboratory activation is allowed only in a
  development build through `VITE_ASSET_REPLACEMENT_LAB=1`.
- `index.ts` is the public runtime barrel.

The authored registry and schema live under `config/`. Never add a replacement target
without passing `scripts/verify_asset_replacements.mjs` and the asset provenance verifier.
Historical paths remain the fallback and must not be renamed, moved, overwritten, or removed.
