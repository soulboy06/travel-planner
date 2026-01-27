---
name: code-inspector
description: A skill for structural code analysis and safe refactoring planning.
---

# Code Inspector Skill

This skill analyzes the project codebase to identify structural risks, redundancies, and quality issues, proposing a safe refactoring plan without altering behavior.

## Inputs
- **Project Root**: Current directory.
- **Language Stack**: TypeScript, Next.js, React, Tailwind CSS (auto-detect or user provided).
- **Focus Modules** (Optional): Specific folders or files to analyze deeply.
- **Scope**: **Refactor Only** (Strictly no functional changes).

## Constraints
1. **Zero Behavior Change**: The refactoring must NOT change the runtime behavior of the application.
2. **Build/Test Integrity**: Every proposed change must maintain a passing build and test state.
3. **Safety First**: Prioritize low-risk changes over high-risk architectural shifts unless necessary.

## Workflow Execution

### Step 1: Project Structure Visualization
1. Analyze the directory structure (using `list_dir` or similar).
2. Identify determining dependencies in `package.json`.
3. Output a high-level tree of the key modules.

### Step 2: Risk Identification (Find Top 5)
Look for and list the top 5 structural risks, such as:
- **Circular Dependencies**: Modules importing each other.
- **Huge Modules/God Classes**: Files exceeding 300 lines or components with complex render logic (>20 props/states).
- **Cross-Layer Violations**: UI components directly accessing DB/API internals (if applicable).
- **Prop Drilling**: Passing data through too many layers.
- **Complex Conditionals**: Deeply nested `if/else` or heavy cognitive complexity.

### Step 3: Static Analysis Summary
1. Run linting commands (e.g., `npm run lint`).
2. Analyze the output for common patterns.
3. Group issues by severity (Error vs Warning).

### Step 4: Redundancy & Merge Proposals
Identify opportunities to reduce code:
- **Duplicate Logic**: Similar functions in `utils` or helpers.
- **UI Redundancy**: Similar components that can be merged into a scalable primitive.
- **Dead Code**: Unused imports, variables, or files.

### Step 5: Branching Refactor Plan
Categorize proposed changes into risk levels:
- **Safe (Low Risk)**: Renaming, Formatting, Commenting, Type Annotation refinements.
- **Medium (Moderate Risk)**: Extract Method, Extract Component, Move File, Merge Utils.
- **Risky (High Risk)**: Change State Management, Rewrite API Layer, Change Library.

## Final Output Format

### Conclusion
(Summary in exactly 3 sentences)

### Core Structural Risks
- [ ] `path/to/file`: [Risk Type] Description
- [ ] ...

### Redundancy & Deletable Items
| Type | Item(s) | Proposal |
|------|---------|----------|
| Merge | `A.ts`, `B.ts` | Combine into `C.ts` |
| Delete| `unused.ts` | Remove file |

### MVP Refactor Plan (Minimum Viable Refactor)
A concrete, step-by-step plan to address the most critical "Safe" or "Medium" issues immediately.

### Next Actionable Step
- **Command**: (e.g., `npx eslint ...` or `mkdir ...`)
- **Target File**: (e.g., `app/page.tsx`)
