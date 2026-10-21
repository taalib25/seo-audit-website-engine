import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { CommanderError } from "commander";
import { EXIT_CODES, exitCodeForCommanderError } from "../src/exit-codes.ts";

const cliPath = fileURLToPath(new URL("../src/index.ts", import.meta.url));

function runCli(args: string[]) {
  return spawnSync(process.execPath, [cliPath, ...args], { encoding: "utf8", env: { ...process.env, NO_COLOR: "1" } });
}

test("commander usage failures map to the usage exit code", () => {
  assert.equal(exitCodeForCommanderError(new CommanderError(1, "commander.missingMandatoryOptionValue", "missing")), EXIT_CODES.usage);
  assert.equal(exitCodeForCommanderError(new CommanderError(1, "commander.unknownOption", "unknown")), EXIT_CODES.usage);
  assert.equal(exitCodeForCommanderError(new CommanderError(1, "commander.missingArgument", "missing")), EXIT_CODES.usage);
  assert.equal(exitCodeForCommanderError(new CommanderError(1, "commander.excessArguments", "extra")), EXIT_CODES.usage);
  assert.equal(exitCodeForCommanderError(new CommanderError(1, "commander.help", "help")), EXIT_CODES.usage);
});

test("requested help stays successful and unrelated failures stay runtime failures", () => {
  assert.equal(exitCodeForCommanderError(new CommanderError(0, "commander.helpDisplayed", "help")), EXIT_CODES.success);
  assert.equal(exitCodeForCommanderError(new CommanderError(0, "commander.help", "help")), EXIT_CODES.success);
  assert.equal(exitCodeForCommanderError(new CommanderError(0, "commander.version", "version")), EXIT_CODES.success);
  assert.equal(exitCodeForCommanderError(new Error("boom")), EXIT_CODES.runtime);
});

test("commander usage errors exit 2 instead of the audit findings code", () => {
  const missingOption = runCli(["verify", "https://example.test"]);
  assert.equal(missingOption.status, EXIT_CODES.usage);
  assert.notEqual(missingOption.status, EXIT_CODES.auditFindings);

  const unknownOption = runCli(["audit", "https://example.test", "--not-an-option"]);
  assert.equal(unknownOption.status, EXIT_CODES.usage);

  const unknownCommand = runCli(["not-a-command"]);
  assert.equal(unknownCommand.status, EXIT_CODES.usage);
});

test("an unknown check id still exits 2 and help exits 0", () => {
  const unknownId = runCli(["verify", "https://example.test", "--ids", "does.not.exist"]);
  assert.equal(unknownId.status, EXIT_CODES.usage);

  const help = runCli(["--help"]);
  assert.equal(help.status, EXIT_CODES.success);
});
