import { describe, it, expect } from "vitest";
import path from "node:path";
import { checkDependabot, checkInstructions, checkRepository, checkWorkflow } from "../../../scripts/ci/check-pr-automation.mjs";

const root = path.resolve(__dirname, "../../..");

const reviewJob = (body: { if?: string; perms?: string; prompt?: string; name?: string } = {}) => `name: Test
on:
  pull_request:
    types: [opened, synchronize]
jobs:
  review:
    if: |
${body.if ?? "      github.event_name == 'pull_request' &&\n      github.event.pull_request.draft == false"}
    runs-on: ubuntu-latest
    permissions:
${body.perms ?? "      contents: read\n      pull-requests: write"}
    steps:
      - name: ${body.name ?? "Review"}
        uses: anthropics/claude-code-action@beta
        with:
          direct_prompt: |
${body.prompt ?? "            Review the PR and post a comment. Never merge it."}
`;

describe("PR automation safety check", () => {
  it("passes this repository's workflows and CLAUDE.md", () => {
    expect(checkRepository(root)).toEqual([]);
  });

  it("accepts a comment-only, draft-skipping review job", () => {
    expect(checkWorkflow("w.yml", reviewJob())).toEqual([]);
  });

  it.each([
    ["an instruction to squash-merge", { prompt: "            5. If all checks pass: squash-merge the PR." }, /instruction to merge/],
    ["an instruction to merge the PR", { prompt: "            Then merge the PR and comment." }, /instruction to merge/],
    ["enabling auto-merge", { prompt: "            Enable auto-merge when green." }, /instruction to merge/],
    ["pushing to the PR branch", { prompt: "            git push origin the-branch" }, /instruction to merge or push/],
    ["an auto-merge step name", { name: "Review & Auto-merge" }, /instruction to merge/],
    ["contents: write", { perms: "      contents: write\n      pull-requests: write" }, /write repository contents/],
    ["write-all", { perms: "      write-all" }, /write repository contents/],
    ["no draft guard", { if: "      github.event_name == 'pull_request'" }, /doesn't skip drafts/],
  ])("rejects %s", (_label, body, message) => {
    expect(checkWorkflow("w.yml", reviewJob(body)).join("\n")).toMatch(message);
  });

  it.each([
    "run: gh pr merge --squash ${{ github.event.pull_request.number }}",
    "run: gh api -X PUT repos/o/r/pulls/1/merge",
    "run: gh pr ready 12",
    "query: mutation { enablePullRequestAutoMerge(input: {}) { clientMutationId } }",
  ])("rejects a merge operation in any workflow: %s", (line) => {
    const wf = `name: X\non: push\njobs:\n  a:\n    runs-on: ubuntu-latest\n    steps:\n      - ${line}\n`;
    expect(checkWorkflow("x.yml", wf).join("\n")).toMatch(/merge operation/);
  });

  it("flags affirmative merge instructions in CLAUDE.md but allows prohibitions", () => {
    expect(checkInstructions("CLAUDE.md", "If checks pass, merge the PR immediately using a squash merge.")).toHaveLength(1);
    expect(checkInstructions("CLAUDE.md", "Never merge PRs or enable auto-merge; a maintainer merges.")).toEqual([]);
    expect(checkInstructions("CLAUDE.md", "Uses `clsx` + `tailwind-merge`.")).toEqual([]);
  });
});

describe("nothing applies labels automatically", () => {
  const script = (body: string) => `name: T
on: [issues]
jobs:
  t:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/github-script@v9
        with:
          script: |
${body}
`;

  it("flags workflows that add or set labels", () => {
    expect(checkWorkflow("w.yml", script("            await github.rest.issues.addLabels({ owner, repo, issue_number: 1, labels: ['x'] });"))).not.toEqual([]);
    expect(checkWorkflow("w.yml", script("            gh issue edit 1 --add-label bug"))).not.toEqual([]);
    expect(checkWorkflow("w.yml", script("            await github.rest.issues.create({ owner, repo, title: 't',\n              labels: ['security'] });"))).not.toEqual([]);
  });

  it("allows comments, assignment and label filters that don't write", () => {
    expect(checkWorkflow("w.yml", script("            await github.rest.issues.createComment({ owner, repo, issue_number: 1, body: 'hi' });"))).toEqual([]);
    expect(checkWorkflow("w.yml", script("            await github.rest.issues.addAssignees({ owner, repo, issue_number: 1, assignees: ['a'] });"))).toEqual([]);
    expect(checkWorkflow("w.yml", script("            // labels are applied by maintainers"))).toEqual([]);
  });

  it("requires every Dependabot entry to set labels: []", () => {
    const entry = (labels: string) => `  - package-ecosystem: npm\n    directory: /\n${labels}`;
    expect(checkDependabot("d.yml", `version: 2\nupdates:\n${entry("    labels: []\n")}`)).toEqual([]);
    expect(checkDependabot("d.yml", `version: 2\nupdates:\n${entry("")}`)).toHaveLength(1);
    expect(checkDependabot("d.yml", `version: 2\nupdates:\n${entry("    labels:\n      - dependencies\n")}`)).toHaveLength(1);
  });
});
