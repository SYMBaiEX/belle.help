import { disableTool } from "eve/tools";

/**
 * Disabled on the root Belle agent.
 *
 * Belle's root session is a conversational coordinator: it resolves context,
 * talks to GitHub through typed tools, and delegates real work to declared
 * subagents. It never needs shell, sandbox filesystem, or web access, so
 * advertising these built-ins only inflates the tool schema on every request
 * (slower turns) and widens the blast radius of a prompt injection.
 *
 * The code-fixer subagent keeps its own sandbox and tools, which is where
 * shell and file access legitimately belong.
 */
export default disableTool();
