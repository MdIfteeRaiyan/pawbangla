PawBangla source snapshot (v26)

This ZIP is a source backup for creating a private Git repository. Cloudflare's Import from Git flow connects to a GitHub or GitLab repository; it does not import this ZIP directly.

Important: this snapshot still contains the ChatGPT Sites integration and is NOT ready to deploy as a standalone Cloudflare Worker. It needs the Cloudflare migration, production D1/R2 bindings, and external identity-provider integration first. Do not deploy this snapshot directly.

Suggested use:
1. Extract the ZIP.
2. Create a private GitHub repository under your account.
3. Use GitHub Desktop to create/publish a repository from the extracted pawbangla folder, or have the migration completed before publishing.
4. Connect the GitHub repository to Cloudflare Workers only after the source has been converted and validated.

No node_modules, build output, Git history, or untracked environment files are included.
