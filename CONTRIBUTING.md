# Contributing to Kiro Cloud Engineering/DevOps Toolbox

Thank you for your interest in contributing to the Kiro Cloud Engineering/DevOps Toolbox! This document provides guidelines for contributing hooks, specs, examples, and documentation.

## Getting Started

1. **Fork the repository** and clone your fork locally
2. **Review the documentation** in `/docs/` to understand the toolbox structure
3. **Check existing issues** to see if your contribution aligns with planned work
4. **Create an issue** before starting major work to discuss your approach

## Types of Contributions

### Hooks

When contributing new hooks:

- Place hooks in the appropriate category directory:
  - `/hooks/security/` - Secret scanning, IAM validation, pre-send scanning
  - `/hooks/stability/` - Test execution, spec validation
  - `/hooks/automation/` - Documentation updates, scaffolding, client generation
  - `/hooks/regulatory/` - Deployment windows, approval requirements

- Follow the hook YAML structure:
  ```yaml
  name: hook-identifier
  description: Purpose and behavior
  on:
    event_type:
      paths: ["pattern/*.ext"]
  run:
    command: |  # OR agent: sonnet
      # Implementation
  on_failure: block_context | warn | block_send
  ```

- Include inline customization guides:
  ```yaml
  # CUSTOMIZE: Update these paths to match your repo structure
  # SOURCE_DIR: "src"  # Your source code directory
  ```

- Test your hook with sample files before submitting

### Specs

When contributing spec templates or golden specs:

- Use the standard spec structure:
  - Intent (one sentence)
  - Contracts (inputs/outputs)
  - Constraints (security, performance, compliance)
  - Design Decisions (and why)
  - Test Expectations (✓ and ✗ cases)

- Place golden specs in `/specs/golden/`
- Place templates in `/specs/templates/`
- Use bracketed placeholders: `[YOUR_SERVICE_NAME]`, `[YOUR_REGION]`
- Include inline guidance for each section

### Examples

When contributing working examples:

- Create a dedicated directory in `/examples/<service-name>/`
- Include complete structure:
  ```
  examples/<service-name>/
  ├── README.md           # Explains concerns addressed, artifacts used
  ├── spec.md             # Service specification
  ├── src/                # Implementation code
  ├── tests/              # Unit and integration tests
  ├── infra/              # Infrastructure as code (CDK/CloudFormation)
  └── docs/               # Additional documentation (if needed)
  ```

- Ensure the example:
  - Builds successfully
  - Tests pass
  - Deploys to AWS (provide deployment instructions)
  - Demonstrates specific toolkit artifacts in action

- Document which primary concerns it addresses
- Include "How to run this example" section with prerequisites

### Documentation

When contributing documentation:

- Place guides in `/docs/guides/`
- Place reference materials in `/docs/reference/`
- Place patterns and best practices in `/docs/patterns/`

- Use clear, actionable language
- Include code examples where applicable
- Link to relevant hooks, specs, and examples
- Cite sources for statistics and metrics

## Pull Request Process

1. **Create a feature branch** from `main`:
   ```bash
   git checkout -b feature/your-feature-name
   ```

2. **Make your changes** following the guidelines above

3. **Test your changes**:
   - Validate YAML syntax for hooks
   - Run tests for code examples
   - Check documentation for broken links

4. **Commit with clear messages**:
   ```bash
   git commit -m "Add scan-terraform-secrets hook for IaC security"
   ```

5. **Push to your fork**:
   ```bash
   git push origin feature/your-feature-name
   ```

6. **Open a Pull Request** with:
   - Clear title describing the change
   - Description explaining:
     - What problem this solves
     - Which primary concern(s) it addresses
     - How to test/validate the change
   - Links to related issues

## Code Style

### YAML (Hooks, Steering Rules)

- Use 2 spaces for indentation
- Include descriptive comments
- Use kebab-case for identifiers: `scan-secrets`, `validate-iam`
- Quote strings that contain special characters

### Markdown (Specs, Documentation)

- Use ATX-style headers (`#`, `##`, `###`)
- Use fenced code blocks with language identifiers
- Use tables for structured data
- Keep line length reasonable (80-120 characters)

### TypeScript (Examples)

- Use 2 spaces for indentation
- Follow modern ES6+ conventions
- Include JSDoc comments for public APIs
- Use async/await over promises
- Include proper error handling

## Testing Requirements

- **Hooks**: Test with sample files to verify trigger conditions and execution
- **Examples**: Include unit tests and integration tests that pass
- **Documentation**: Verify all links work and code examples are correct

## Community Guidelines

- Be respectful and constructive in discussions
- Focus on the problem being solved, not personal preferences
- Welcome newcomers and help them get started
- Follow the project's code of conduct (coming soon)

## Questions?

- Open an issue for questions about contributing
- Check existing issues and documentation first
- Be patient - maintainers are volunteers

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for helping make the Kiro Cloud Engineering/DevOps Toolbox better!
