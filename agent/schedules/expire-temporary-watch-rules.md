---
cron: "*/30 * * * *"
---

Check for repository watch rules whose watchExpiresAt has passed and disable them via configure_watch_rule; audit each change. If none, finish silently.
