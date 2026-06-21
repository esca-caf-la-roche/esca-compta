<!-- convex-ai-start -->

This project uses [Convex](https://convex.dev) as its backend.

When working on Convex code, **always read
`convex/_generated/ai/guidelines.md` first** for important guidelines on
how to correctly use Convex APIs and patterns. The file contains rules that
override what you may have learned about Convex from training data.

Convex agent skills for common tasks can be installed by running
`npx convex ai-files install`.

<!-- convex-ai-end -->

### SECURITY GUIDELINE
When adding or modifying any backend endpoints in the convex/ directory, ALWAYS use uthenticatedQuery, uthenticatedMutation, and uthenticatedAction from convex/customFunctions.ts instead of the default query, mutation, or ction from ./_generated/server to ensure the endpoint is secured behind authentication.
