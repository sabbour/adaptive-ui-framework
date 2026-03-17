import type { ComponentPack } from '../../framework/registry';
import type { AdaptiveNode } from '../../framework/schema';
import { GitHubLogin, GitHubQuery, GitHubRepoInfo, GitHubPicker } from './components';
import { GitHubSettings } from './GitHubSettings';
import { getStoredToken } from './auth';
import { trackedFetch } from '../../framework/request-tracker';

/** Parse the GitHub Link header to extract the "next" page URL */
function parseLinkNext(linkHeader: string | null): string | null {
  if (!linkHeader) return null;
  const match = linkHeader.match(/<([^>]+)>;\s*rel="next"/);
  return match ? match[1] : null;
}

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
  Example: github_api_get({ path: "/repos/owner/repo/issues?state=open&per_page=100" })
  Example: github_api_get({ path: "/user/orgs?per_page=100" })
  Example: github_api_get({ path: "/orgs/{org}/repos?sort=updated&per_page=100" })

  The tool auto-paginates list endpoints (up to 200 items). Always use per_page=100 for efficiency.

  REPO LISTING WORKFLOW (multi-turn — do NOT collapse into one step):
  When listing repos, ALWAYS show an org/account picker FIRST in a separate turn:
  1. Call github_api_get({ path: "/user/orgs?per_page=100" }) to get the user's organizations
  2. In THIS turn's response, show a select/radioGroup with the org names PLUS "Personal account (username)"
     as options. Let the user pick. Do NOT fetch repos yet — STOP here and wait for the user's choice.
  3. Only AFTER the user selects an org, in the NEXT turn, call:
     - github_api_get({ path: "/orgs/{org}/repos?sort=updated&per_page=100" }) for an org
     - github_api_get({ path: "/user/repos?sort=updated&per_page=100&type=owner" }) for personal
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

- "githubPicker": { api, bind, label?, labelKey?, valueKey?, descriptionKey?, labelBind?, loadingLabel?, includePersonal? }
    Dropdown that fetches options from a GitHub API endpoint at render time (client-side).
    Use this for ANY GitHub list that should come from the API (orgs, repos, branches, etc.).
    DO NOT use github_api_get tool for data that just needs to be shown in a picker — use githubPicker instead.
    Auto-paginates up to 300 items.
    
    Examples:
    - Orgs (with personal account): { type: "githubPicker", api: "/user/orgs", bind: "githubOrg", label: "GitHub account", labelKey: "login", valueKey: "login", includePersonal: true, loadingLabel: "Loading organizations..." }
    - Repos for an org: { type: "githubPicker", api: "/orgs/{{state.githubOrg}}/repos?sort=updated", bind: "githubRepo", label: "Repository", labelKey: "name", valueKey: "name", descriptionKey: "description", loadingLabel: "Loading repositories..." }
    - Repos for personal account: { type: "githubPicker", api: "/user/repos?sort=updated&type=owner", bind: "githubRepo", label: "Repository", labelKey: "name", valueKey: "name", descriptionKey: "description" }
    - Branches: { type: "githubPicker", api: "/repos/{{state.githubOrg}}/{{state.githubRepo}}/branches", bind: "branch", label: "Branch", labelKey: "name", valueKey: "name" }

- "githubRepoInfo": { repo: "owner/repo" }
    Displays a rich repo card with name, description, language, stars, forks, and issue count.
    The repo prop supports {{state.key}} interpolation.

When the user mentions a GitHub repo or workflow:
1. If __githubToken is not set, show githubLogin component first
2. For PICKING from a list (orgs, repos, branches), use githubPicker component — data is fetched client-side, no tokens wasted
3. Use the github_api_get TOOL only when the LLM needs to SEE the data to make decisions (e.g., check if a file exists, read workflow config)
4. For write operations (create issue, comment, etc.), use githubQuery component with confirm`;

export function createGitHubPack(): ComponentPack {
  return {
    name: 'github',
    displayName: 'GitHub',
    components: {
      githubLogin: GitHubLogin,
      githubQuery: GitHubQuery,
      githubRepoInfo: GitHubRepoInfo,
      githubPicker: GitHubPicker,
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
          const baseUrl = `https://api.github.com${path.startsWith('/') ? '' : '/'}${path}`;
          const headers = { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json' };

          try {
            // Auto-paginate list endpoints (arrays) up to 200 items
            let allData: unknown;
            const firstRes = await trackedFetch(baseUrl, { headers });
            const firstData = await firstRes.json();
            if (!firstRes.ok) return `GitHub API error (${firstRes.status}): ${(firstData as any)?.message ?? JSON.stringify(firstData)}`;

            if (Array.isArray(firstData)) {
              allData = [...firstData];
              let nextUrl = parseLinkNext(firstRes.headers.get('link'));
              while (nextUrl && (allData as unknown[]).length < 200) {
                const pageRes = await trackedFetch(nextUrl, { headers });
                if (!pageRes.ok) break;
                const pageData = await pageRes.json();
                if (!Array.isArray(pageData) || pageData.length === 0) break;
                (allData as unknown[]).push(...pageData);
                nextUrl = parseLinkNext(pageRes.headers.get('link'));
              }
            } else {
              allData = firstData;
            }

            // Slim down array responses to essential fields (GitHub API returns ~5KB per item)
            if (Array.isArray(allData)) {
              allData = (allData as any[]).map(item => {
                // Repos
                if (item.full_name && item.html_url) {
                  return { full_name: item.full_name, name: item.name, description: item.description, language: item.language, visibility: item.visibility, default_branch: item.default_branch, updated_at: item.updated_at };
                }
                // Orgs
                if (item.login && item.url && !item.full_name) {
                  return { login: item.login, description: item.description, avatar_url: item.avatar_url };
                }
                // Issues/PRs
                if (item.number !== undefined && item.title) {
                  return { number: item.number, title: item.title, state: item.state, user: item.user?.login, labels: item.labels?.map((l: any) => l.name), created_at: item.created_at, html_url: item.html_url };
                }
                // Fallback: return as-is
                return item;
              });
            }

            const text = JSON.stringify(allData, null, 2);
            let result = text.length > 30000 ? text.slice(0, 30000) + '\n[truncated]' : text;

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
    intentResolvers: {
      'github-orgs': {
        description: 'Pick a GitHub org or personal account',
        props: 'key, label?',
        resolve: (ask) => ({
          type: 'githubPicker',
          api: '/user/orgs',
          bind: (ask.key ?? ask.bind) as string,
          label: (ask.label as string) ?? 'GitHub account',
          labelKey: 'login',
          valueKey: 'login',
          includePersonal: true,
          loadingLabel: 'Loading organizations...',
        } as unknown as AdaptiveNode),
      },
      'github-repos': {
        description: 'Pick a GitHub repository (requires githubOrg in state)',
        props: 'key, label?, org?',
        resolve: (ask) => {
          const org = (ask.org as string) || '{{state.githubOrg}}';
          // If the selected org matches the user's personal account, use /user/repos
          // The component will interpolate {{state.githubOrg}} at render time
          return {
            type: 'githubPicker',
            api: `/orgs/${org}/repos?sort=updated`,
            bind: (ask.key ?? ask.bind) as string,
            label: (ask.label as string) ?? 'Repository',
            labelKey: 'name',
            valueKey: 'name',
            descriptionKey: 'description',
            loadingLabel: 'Loading repositories...',
          } as unknown as AdaptiveNode;
        },
      },
    },
  };
}
