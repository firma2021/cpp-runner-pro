# Changelog (English)

## v1.1.5 — Bug Fixes & Improvements (current)

### Bug Fixes
- **Global Settings Bug**: Fixed an issue where `outputDirectory`, `treatWarningsAsErrors`, and `excludedFileExtensions` were incorrectly saved to workspace settings instead of global settings when configured in the Global Settings tab.
- **Changelog Display**: Renamed `CHANGELOG_EN.md` to `CHANGELOG.md` to ensure proper display on VS Code Marketplace.

### Improvements
- **Smart Compile Detection**: Replaced source file timestamp comparison with executable file mtime caching. Now compares the current executable's modification time with the cached value to determine if recompilation is needed. This provides more accurate detection when executables are deleted or modified externally.
- **Debug Configuration**: Added `.vscode/launch.json` and `.vscode/tasks.json` for easier extension debugging and development.

## v0.3.0 — Persistent Terminal Management

### New Features
- **Persistent Compile Terminal**: A dedicated "C++ Compile" terminal is pre-created at extension activation and reused for all compilations. It appears at the top of the terminal list.
- **Multiple Run Terminals**: Each executable can have multiple run terminals, supporting simultaneous execution (e.g., running a server and a client at the same time).
- **Smart Terminal Reuse**: When a program finishes running, re-running the same executable reuses the idle terminal automatically without prompting. Prompt only appears when the program is still running.
- **Shell Integration Support**: Uses VS Code's Shell Integration API to detect command exit codes and program completion status accurately.
- **Auto-Compile**: Automatically compiles when source file is modified (compares source and executable modification timestamps).

### Terminal Behavior
- **Compile Terminal**: 
  - Single persistent terminal named "C++ Compile" with gear icon
  - Pre-created at extension activation for consistent ordering
  - Shared for all compilations across the workspace
  - Shows compilation errors with exit code detection

- **Run Terminals**:
  - Named "C++ Run: <executable>" with play icon
  - Supports multiple instances for the same executable
  - When program is running: prompts to switch/create new/restart/close
  - When program has finished: automatically reuses the idle terminal

### Technical Improvements
- Removed dependency on memory-based mtime cache; now uses filesystem timestamps directly
- Added compilation lock and queue for concurrent compilation requests
- Uses `onDidEndTerminalShellExecution` event for accurate exit code detection

## v0.2.0 — Tasks-based compilation and run
- Move compilation into VS Code tasks (CustomExecution/Pseudoterminal) so the task system manages terminals and lifecycle.
- Preserves ANSI color output in the terminal UI while letting the extension detect whether compilation produced output (warnings/errors) via the Pseudoterminal state.
- Cleaner implementation: tasks are reused naturally by VS Code when appropriate and the extension can rely on task lifecycle events.

## v0.1.0 — Terminal-managed compilation and run
- Compilation and execution were performed directly in terminals opened by the extension.
- This preserved terminal colors (ANSI), but required explicit terminal management (creating, reusing, and disposing terminals).
- Managing terminals and ensuring the right terminal mapping for multiple runs introduced complexity and edge cases.

## v0.0.1 — child_process.exec compilation with OutputChannel
- Initial approach executed the compiler via `child_process.exec` and wrote stdout/stderr into the extension's OutputChannel.
- Drawback: VS Code OutputChannel does not render ANSI color sequences, so compiler colorized diagnostics were lost.
- This motivated exploring terminal-based execution to preserve color.
