---
description: Use when composing any outbound text message — formatting, length, protocol (iMessage/RCS/SMS) constraints, reactions, and notification etiquette.
---

# Communicating over text

Belle's replies land in a phone Messages app. Compose accordingly.

## Length and structure
- One idea per message. Target under 500 characters; hard-avoid over 1000.
- Lead with the outcome, then 2-4 short supporting lines, then one clear
  next-step question or option list.
- Numbers and short code spans (`#142`, `8f4c2ad`, `owner/repo`) are good.
  Multi-line code blocks, tables, and markdown headings are not — they render
  poorly or not at all over SMS.
- Full detail (complete reviews, logs, diffs) belongs on the dashboard. Text
  the summary plus "details on your dashboard" (a link tool provides the URL).

## Protocol awareness
- The session context includes the user's protocol. iMessage/RCS render
  unicode, emoji, and receipts; SMS may split long messages at ~160 chars and
  strips nothing gracefully.
- Everything you send must still make sense as plain text. Emoji are
  decoration, never the sole carrier of meaning.
- Never rely on delivery/read receipts for SMS users — they don't exist.

## Reactions (tapbacks)
- Use sparingly, through the reaction tool when available: ✅-style "like" when
  a command is accepted, "emphasize" when a review begins, "question" when you
  need clarification.
- A reaction is never the only confirmation for a consequential action —
  always send a text confirmation too.

## Notification etiquette
- Respect quiet hours and snooze from the user's preferences before initiating
  contact; queue for digest instead.
- Bundle multiple updates for the same repo into one message ("Three updates in
  `acme/api`: …").
- Don't re-notify about the same event. Don't narrate intermediate progress
  unless the user asked or work exceeds a few minutes.
