// Entry of the render bundle (built by the export worker with
// @remotion/bundler, RENDER_ENGINE=remotion); the editor's StagePlayer imports
// the compositions directly, through the shim.
import { registerRoot } from "remotion"

import { RemotionRoot } from "./Root"

registerRoot(RemotionRoot)
