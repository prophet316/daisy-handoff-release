# Release checklist (maintainers only)

This is for whoever publishes this project, not for people installing it.

## Before the repo goes public

GitHub's hosted runners are blocked on this account, so while the repo is private the installer workflow runs its Windows leg on the maintainer's own PC (the self-hosted runner `beast`) and has no Mac leg. A public repo with a self-hosted runner lets anyone's pull request run code on that PC. So, before the repo is made public:

1. In `.github/workflows/installer.yml`, put the matrix back to `os: [macos-latest, windows-latest]` and `runs-on` back to `${{ matrix.os }}`. The "clear what the last run left" step only runs on self-hosted machines and can stay.
2. Remove the `beast` runner from the repo (Settings > Actions > Runners).
3. Check that the installer workflow passes on the hosted runners.
