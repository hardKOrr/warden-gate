# TypeScript & Naming

## Overview

Use these rules for any TypeScript implementation in this repository.

## Rules

- TypeScript uses ESM
- Keep 2-space indentation and 80-column wrapping consistent with Biome
- Avoid `any` and non-null assertions
- Tool names come directly from `tools.yaml` keys — no prefix/separator layer

## Naming

- Name tools.yaml entries for what they return, e.g. `get_<system>_credential`
  or `mint_<system>_token`
- Prefer descriptive input and result shapes over opaque tuples or positional
  arrays
