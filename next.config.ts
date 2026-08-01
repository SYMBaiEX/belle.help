import type { NextConfig } from "next";
import { withEve } from "eve/next";
import { withWorkflow } from "workflow/next";

const nextConfig: NextConfig = {
  experimental: {
    useTypeScriptCli: true,
  },
};

// withEve mounts the agent service; withWorkflow adds the directive loader
// that turns "use workflow"/"use step" in the app tree into durable steps.
export default withWorkflow(withEve(nextConfig));
