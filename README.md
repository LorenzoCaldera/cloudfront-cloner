# cloudfront-cloner

A small TypeScript CLI that helps clone or recreate CloudFront distributions and related policies/resources.

## Overview

This project reads CloudFront distribution configuration and related policy objects, adapts identifiers (origins, function ARNs, policy IDs), and can create new distributions and policies using the AWS SDK for JavaScript (v3).

Core code lives under `src/` and is compiled to `dist/` before running.

## Project structure (key files)

- `src/cli/index.ts` - CLI entrypoint and argument parsing.
- `src/aws/` - AWS interaction helpers:
  - `getDistributionConfig.ts` - fetches an existing distribution configuration.
  - `getPolicies.ts` - retrieves policies referenced by a distribution.
  - `createPolicies.ts` - creates missing policies in the target account.
  - `createDistribution.ts` - creates a new distribution using the transformed configuration.
- `src/logic/` - transformation and comparison logic:
  - `comparePolicies.ts`, `extractPoliciesIds.ts`, `getInUseMissingPolicies.ts` - analyze and find missing/used policies.
  - `replace/` - set of replacer functions to modify the distribution config (origins, function ARNs, cache behaviors, policy IDs).
- `src/utils/` - small utilities: `parseArgs.ts`, `getUserInput.ts`, `mini-chalk.ts`.

## How it works

1. Parse CLI args (in `cli/index.ts`).
2. Read the source distribution configuration (`getDistributionConfig`).
3. Extract and fetch referenced policies (`getPolicies`).
4. Compare policies and identify any missing/in-use policies (`logic/*`).
5. Replace identifiers (origins, function ARNs, policy IDs) using helpers in `logic/replace`.
6. Create any required policies in the target account (`createPolicies`) and create the new distribution (`createDistribution`).

All AWS calls use `@aws-sdk/client-cloudfront` and standard credential providers.
 
## Installation & build

1. Install dependencies:

```
npm install
```

2. Build (TypeScript -> JavaScript):

```
npm run build
```

## Running

- On Linux/macOS (or any shell that forwards args for `npm start`):

```
npm start -- --yourParam value
```

- On Windows PowerShell: compile first, then run node directly (PowerShell handles argument forwarding differently):

```
npm run build
node dist/cli/index.js --yourParam value
```

Replace `--yourParam value` with the actual CLI flags this project expects (see `src/cli/index.ts`). Typical flags will include source distribution id, target settings, and dry-run toggles.

## CLI flags

The CLI accepts GNU-style `--flag value` or `--flag=value`. If a flag is provided without a value it is treated as a boolean `true`.

- `--originProfileName` (string, required): AWS credentials profile name for the source account.
- `--destinationProfileName` (string, required): AWS credentials profile name for the destination account.
- `--distributionIdToCopy` (string, required): The CloudFront distribution ID to copy.
- `--copyRefererName` (string, optional): If provided, used as the new CallerReference name (skips interactive prompt).
- `--copyComment` (string, optional): If provided, used as the new distribution Comment (skips interactive prompt).
- `--debug` (boolean, optional): If set, runs in debug mode and avoids creating the distribution (writes `debug-report.json` only).

Example invocations:

- Linux / macOS / shells that forward `npm` args:

```bash
npm start -- --originProfileName=sourceProfile --destinationProfileName=destProfile --distributionIdToCopy=E1234567890 --copyRefererName=myCopy --copyComment="Copied distribution" --debug
```

- Windows PowerShell (build then run):

```powershell
npm run build
node dist/cli/index.js --originProfileName sourceProfile --destinationProfileName destProfile --distributionIdToCopy E1234567890 --copyRefererName myCopy --copyComment "Copied distribution" --debug
```

## Notes for contributors

- The compiled entrypoint is `dist/cli/index.js` produced by `tsc -p tsconfig.json`.
- Use the helper modules in `src/logic/replace` when adding new replacement rules.
- Keep AWS calls in `src/aws` so they can be mocked or swapped for test doubles.
