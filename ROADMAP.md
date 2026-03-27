# Roadmap

Planned features and improvements for Piannotator.

- **Turn-scoped review** - Augment `/annotate` (no args) to show the code diff from the last agent turn alongside the assistant's text output, when VCS history is available.
- **Annotation apply** - Let the agent apply `suggestion` blocks from annotations directly as patches.
- **Keyboard navigation** - Jump between files and annotations without the mouse.
- **Review thread continuity** - Show comments from previous reviews when opening the next review so discussion stays attached to the code across iterations, with room to extend the same model to GitHub pull request threads later.
- **Cross-agent packaging** - Repackage Piannotator as a cross-agent skill so the review UI can be used beyond pi, even if that means trading some of the current tool and slash command integration for a more portable review flow with exportable results.
