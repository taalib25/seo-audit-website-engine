# @aeo/cli

Local SEO/AEO/GEO audits and check verification.

## Exit codes

- `0`: command completed and checks passed (or no checks failed).
- `1`: one or more checks failed or warned.
- `2`: invalid command usage or unknown check IDs.
- `3`: crawl, configuration, report, or audit runtime error.
- `4`: probe cost exceeds `$0.50` and `--yes` was not provided.
