# Roadmap

Planned features and improvements for Piannotator.

- **cmux integration** - When running inside cmux, open the review UI as a browser split pane next to the terminal instead of a floating Glimpse window. Automatic detection via environment variables.
- **Turn-scoped review** - Augment `/annotate` (no args) to show the code diff from the last agent turn alongside the assistant's text output, when VCS history is available.
- **Annotation apply** - Let the agent apply `suggestion` blocks from annotations directly as patches.
- **Keyboard navigation** - Jump between files and annotations without the mouse.
