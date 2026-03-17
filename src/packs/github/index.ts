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
  workflows, or check repo details BEFORE generating the UI response. Returns JSON data
  that YOU can see and use to build a meaningful UI (tables, selects, repo cards).
  Requires the user to be signed in (githubLogin component must have been shown first).
  Example: github_api_get({ path: "/repos/owner/repo/issues?state=open&per_page=10" })
  Example: github_api_get({ path: "/user/orgs" })
  Example: github_api_get({ path: "/orgs/{org}/repos?sort=updated&per_page=30" })

  REPO LISTING WORKFLOW (multi-turn — do NOT collapse into one step):
  When listing repos, ALWAYS show an org/account picker FIRST in a separate turn:
  1. Call github_api_get({ path: "/user/orgs" }) to get the user's organizations
  2. In THIS turn's response, show a select/radioGroup with the org names PLUS "Personal account (username)"
     as options. Let the user pick. Do NOT fetch repos yet — STOP here and wait for the user's choice.
  3. Only AFTER the user selects an org, in the NEXT turn, call:
     - github_api_get({ path: "/orgs/{org}/repos?sort=updated&per_page=30" }) for an org
     - github_api_get({ path: "/user/repos?sort=updated&per_page=30&type=owner" }) for personal
     Then show the repo list as a select.
  Do NOT fetch repos and orgs in the same tool-call round. Do NOT skip the org picker.

  IMPORTANT: When you need to READ data to present it to the user (list repos, show issues,
  display branches), ALWAYS use this tool — NOT githubQuery. The tool runs during inference
  so you can see the results and format them into a proper UI (select, table, list).

COMPONENTS (use in "ask" as { type: "component", component: "name", props: {} } — NEVER in "show"):
- "githubLogin": { title?, description? }
    GitHub sign-in card. Shows a "Sign in with GitHub" button that opens an OAuth Device Flow.
    On success, sets __githubToken and __githubUser in state.
    If already signed in, shows a green confirmation with the username and avatar.
    Use this FIRST whenever GitHub API access is needed and __githubToken is not set.
    This is a self-managed component — do NOT include a "next" prompt for sign-in steps.

- "githubQuery": { api, bind, method?, body?, loadingLabel?, showResult?, confirm? }
    Generic GitHub API caller for WRITE operations (POST, PUT, PATCH, DELETE).
    Use ONLY for mutations that need user confirmation (create issue, comment, etc.).
    Do NOT use githubQuery for read-only data fetching — use the github_api_get tool instead.
    Write operations show a confirmation dialog. Results are stored in state under the bind key.

- "githubRepoInfo": { repo: "owner/repo" }
    Displays a rich repo card with name, description, language, stars, forks, and issue count.
    The repo prop supports {{state.key}} interpolation.

When the user mentions a GitHub repo or workflow:
1. If __githubToken is not set, show githubLogin component first
2. Use the github_api_get TOOL to read data (repos, issues, PRs, branches) — you'll see the results and can build proper UI
3. Present results using standard components (select for choices, table for lists, markdown for details)
4. For write operations (create issue, comment, etc.), use githubQuery component with confirm`;

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
            let result = text.length > 8000 ? text.slice(0, 8000) + '\n[truncated]' : text;

            // When listing orgs, remind the LLM to show an org picker before fetching repos
            if (path.match(/^\/user\/orgs\b/i)) {
              result += '\n\nIMPORTANT: Show an org/account picker to the user NOW. Do NOT call github_api_get again for repos in this turn. Wait for the user to select an org first.';
            }

            return result;
          } catch (err) {
            return `Failed to call GitHub API: ${err instanceof Error ? err.message : String(err)}`;
          }
        },
      },
    ],
  };
}
