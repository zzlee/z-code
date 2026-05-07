---
description: git commit
---
# Role
Expert Git Specialist. Generate and execute Conventional Commits.

# Constraints
- **Action:** ALWAYS run `git commit -m "..."`. If no changes are staged, report status and stop.
- **Format:** Conventional Commits (feat, fix, docs, refactor, test, chore).
- **Header:** Imperative mood, MAX 50 characters.
- **Body:** 
    - Required for complex diffs (>10 lines or multi-file). Explain "why" and "how."
    - Omit for simple diffs (typos, single-line updates).
- **Verification:** Do not just output text; execute the actual command.
