import { resolveRuntimeAssetUrl } from '../assets';
import type { OverheadEmoteId } from '../world_api';

export function emoteIconUrl(id: OverheadEmoteId): string {
  return resolveRuntimeAssetUrl(`/ui/emotes/emote-${id}.png`);
}
