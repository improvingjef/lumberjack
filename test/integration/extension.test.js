// Extension-host smoke tests: run inside a real VS Code via @vscode/test-cli.
// These prove the extension loads, contributes what it says, and its commands
// execute without throwing — the layer the unit tests can't reach.
const assert = require("assert");
const vscode = require("vscode");

suite("Lumberjack extension host", () => {
  test("is present and activates", async () => {
    const ext = vscode.extensions.getExtension("improvingjef.lumberjack");
    assert.ok(ext, "extension is installed in the test host");
    await ext.activate();
    assert.ok(ext.isActive, "extension activated");
  });

  test("registers its commands", async () => {
    const cmds = await vscode.commands.getCommands(true);
    assert.ok(cmds.includes("lumberjack.open"), "lumberjack.open registered");
    assert.ok(cmds.includes("lumberjack.refresh"), "lumberjack.refresh registered");
  });

  test("open command runs without throwing", async () => {
    await vscode.commands.executeCommand("lumberjack.open");
  });

  test("refresh command runs without throwing", async () => {
    await vscode.commands.executeCommand("lumberjack.refresh");
  });
});
