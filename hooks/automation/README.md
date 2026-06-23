# Automation Hooks

This directory contains hooks that automate repetitive documentation and scaffolding tasks.

## Purpose

Automation hooks eliminate manual work by:
- Automatically updating API documentation when routes change
- Generating service boilerplate from specs
- Regenerating client stubs when API contracts change
- Keeping documentation in sync with code

## Primary Concern Addressed

**Primary Concern #3: Engineer Burnout from Repetitive Work**
- 47% of engineers report burnout from repetitive infrastructure work
- 36% of time spent on manual tasks
- Solution: Automate documentation and scaffolding via hooks

## Hooks

Automation hooks include:
- `update-docs.yaml` - Auto-update API documentation when route handlers change (Coming soon)
- `scaffold-service.yaml` - Generate service boilerplate from a new spec (Coming soon)
- **`regen-clients.yaml`** - Automatically regenerate client stubs when API contracts change

### regen-clients.yaml

Automatically regenerates client stubs when API contracts change, eliminating manual SDK maintenance work.

**Features:**
- Supports multiple API formats: OpenAPI/Swagger, GraphQL, gRPC/Protobuf, TypeScript
- Generates clients for multiple languages simultaneously
- Detects breaking changes automatically
- Auto-bumps client versions based on change type
- Creates detailed change summaries for downstream consumers

**Key Benefits:**
- Eliminates 36% of time spent on manual SDK updates
- Keeps clients in sync with API automatically
- Catches breaking changes before consumers break
- Reduces dependency coordination delays (77% of teams wait for others)

**When to use:**
- When API contract files change (OpenAPI, GraphQL schema, .proto files)
- When you need to keep client SDKs in sync with backend APIs
- When coordinating API changes across multiple consumers
- When managing multi-language client generation

## Usage

Copy hooks to your project's `.kiro/hooks/` directory and customize documentation structures and scaffolding templates according to the inline guides in each hook.
