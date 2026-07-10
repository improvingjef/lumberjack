import { defineConfig } from "@vscode/test-cli";

// Integration (extension-host) smoke tests. Downloads a VS Code build the
// first time, then activates the extension inside it. Kept separate from the
// fast `npm test` unit suite, which needs no VS Code.
export default defineConfig({
  files: "test/integration/*.test.js",
  mocha: { timeout: 60000 },
});
