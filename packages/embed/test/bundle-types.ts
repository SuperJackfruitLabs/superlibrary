// Checked by `tsc --noEmit` (the package typecheck includes test/): the hand-kept public types of the
// bundle are exactly the source's, so a host that vendors them cannot drift from what the SDK does.
import type * as Bundle from '../bundle/superlibrary-embed';
import type * as Src from '../src/index';
import type { EmbedGrant } from '@superlibrary/contract';

type Same<A, B> = (<T>() => T extends A ? 1 : 2) extends (<T>() => T extends B ? 1 : 2) ? true : false;
const checks: [
  Same<Bundle.MountOptions, Src.MountOptions>,
  Same<Bundle.Mounted, Src.Mounted>,
  Same<Bundle.ShareInfo, Src.ShareInfo>,
  Same<Bundle.Theme, Src.Theme>,
  Same<Bundle.EmbedGrant, EmbedGrant>,
  Same<typeof Bundle.mountArtifact, typeof Src.mountArtifact>,
  Same<typeof Bundle.formatBytes, typeof Src.formatBytes>,
  Same<typeof Bundle.visibilityWords, typeof Src.visibilityWords>,
] = [true, true, true, true, true, true, true, true];
export { checks };
