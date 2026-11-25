# Prompt Master

Turns a rough, half-formed prompt into a clear, well-structured one before you send it.

- Type your draft, then press **✨ Prompt Master** in the row just above the prompt box. Your draft is replaced with the rewrite so you can review and edit it before sending.
- **↩ Undo** puts your original draft back.
- Or run `/prompt-master <rough prompt>` and the rewrite lands in the prompt box. Where there is no prompt box it can fill (for example the mobile app on a cloud session), the rewrite is shown in the chat for you to copy.

It keeps your intent, file names, code and constraints, and turns the draft into a prompt that is ready to send: it adds steps and a clear definition of done, and fills gaps by telling Claude to look things up or make a stated assumption, never by asking you more questions. Rewrites use the `sonnet` model through your session and count toward session usage.

## Install

At the prompt of a Claude Code terminal session:

```
/plugin install prompt-master --marketplace komo2oscott/claude-code
```

From a shell:

```
claude plugin install prompt-master --marketplace komo2oscott/claude-code
```

In the desktop app: click + next to the prompt box, then Plugins, Add marketplace with `komo2oscott/claude-code`, then Add plugin.
