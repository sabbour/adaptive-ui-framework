import type { ComponentPack } from '../../framework/registry';
import { GitHubLogin, GitHubQuery, GitHubRepoInfo } from './components';
import { GitHubSettings } from './GitHubSettings';
import { getStoredToken } from './auth';
import { trackedFetch } from '../../framework/request-tracker';

// ─── GitHub Component Pack ───
// Provides GitHub API integration: authentication, repo queries, and issue/PR management.
//
// Prerequisites:
// - Set `__githubToken` in state with a valid GitHub Personal Access Token (PAT)
//   (the githubLogin component handles this)

const GITHUB_SYSTEM_PROMPT = `
GITHUB PACK:

You have access to GitHub-specific capabilities. When the user discusses GitHub repos,
issues, PRs, or workflows, use these features.

TOOLS (called during inference, before generating UI):
- github_api_get: Read-only GitHub API caller. Use to list repos, issues, PRs, branches,
  workflows, or check repo details BEFORE generating the UI response.
  Requires the user to be signed in (githubLogin component must have been shown first).
  Example: github_api_get({ path: "/repos/owner/repo/issues?state=open&per_page=10" })

COMPONENTS (use in "ask" as { type: "component", component: "name", props: {} } — NEVER in "show"):
- "githubLogin": { title?, description? }
    GitHub sign-in card. Shows a "Sign in with GitHub" button that opens an OAuth Device Flow.
    On success, sets __githubToken and __githubUser in state.
    If already signed in, shows a green confirmation with the username and avatar.
    Use this FIRST whenever GitHub API access is needed and __githubToken is not set.
    This is a self-managed component — do NOT include a "next" prompt for sign-in steps.

- "githubQuery": { api: "/repos/{owner}/{repo}/issues", bind: "stateKey", method?: "GET"|"POST"|"PUT"|"PATCH"|"DELETE", body?: "json string", loadingLabel?, showResult?, confirm? }
    Generic GitHub API caller. Works like azureQuery but for the GitHub REST API.
    The API path supports {{state.key}} interpolation.
    GET requests auto-execute on mount. Write operations show a confirmation dialog.
    Results are stored as JSON string under the bind key.
    
    Common API paths:
    - List repos for a user: /users/{username}/repos?sort=updated&per_page=10
    - Get a repo: /repos/{owner}/{repo}
    - List issues: /repos/{owner}/{repo}/issues?state=open&per_page=20
    - List PRs: /repos/{owner}/{repo}/pulls?state=open&per_page=20
    - Get repo languages: /repos/{owner}/{repo}/languages
    - List branches: /repos/{owner}/{repo}/branches
    - List workflows: /repos/{owner}/{repo}/actions/workflows
    - List workflow runs: /repos/{owner}/{repo}/actions/runs?per_page=5
    - Create an issue: method "POST", api "/repos/{owner}/{repo}/issues", body with title and body
    - Create a comment: method "POST", api "/repos/{owner}/{repo}/issues/{number}/comments", body with body

- "githubRepoInfo": { repo: "owner/repo" }
    Displays a rich repo card with name, description, language, stars, forks, and issue count.
    The repo prop supports {{state.key}} interpolation.

When the user mentions a GitHub repo or workflow:
1. If __githubToken is not set, show githubLogin component first
2. Use githubQuery to fetch data from the GitHub API
3. Present results using standard show types (table, markdown, code)
4. For write operations (create issue, comment, etc.), always confirm first`;

export function createGitHubPack(): ComponentPack {
  return {
    name: 'github',
    displayName: 'GitHub',
    components: {
      githubLogin: GitHubLogin,
      githubQuery: GitHubQuery,
      githubRepoInfo: GitHubRepoInfo,
    },
    systemPrompt: GITHUB_SYSTEM_PROMPT,
    settingsComponent: GitHubSettings,
    tools: [
      {
        definition: {
          type: 'function' as const,
          function: {
            name: 'github_api_get',
            description: 'Call the GitHub REST API (GET only). Use to list repos, issues, PRs, branches, workflows, or read repo details before generating the UI response. Requires the user to have signed in via githubLogin first.',
            parameters: {
              type: 'object',
              properties: {
                path: {
                  type: 'string',
                  description: 'GitHub API path starting with /. Example: /repos/owner/repo/issues?state=open&per_page=10',
                },
              },
              required: ['path'],
            },
          },
        },
        handler: async (args: Record<string, unknown>) => {
          const token = getStoredToken();
          if (!token) return 'Error: User is not signed in to GitHub. Show the githubLogin component first.';
          const path = String(args.path);
          const url = `https://api.github.com${path.startsWith('/') ? '' : '/'}${path}`;
          try {
            const res = await trackedFetch(url, {
              headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' },
            });
            const data = await res.json();
            if (!res.ok) return `GitHub API error (${res.status}): ${data?.message ?? JSON.stringify(data)}`;
            const text = JSON.stringify(data, null, 2);
            return text.length > 8000 ? text.slice(0, 8000) + '\n[truncated]' : text;
          } catch (err) {
            return `Failed to call GitHub API: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
    ],
  };
}
