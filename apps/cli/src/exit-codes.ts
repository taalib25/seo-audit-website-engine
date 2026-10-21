export const EXIT_CODES = {
  success: 0,
  auditFindings: 1,
  usage: 2,
  runtime: 3,
  probeConfirmation: 4,
} as const;

export type ExitCode = (typeof EXIT_CODES)[keyof typeof EXIT_CODES];

/** Commander codes that represent an explicitly requested help or version output. */
const HELP_CODES = new Set(["commander.helpDisplayed", "commander.version"]);

/** Commander codes that describe an invalid invocation rather than a failed run. */
const USAGE_CODES = new Set([
  "commander.error",
  "commander.unknownCommand",
  "commander.unknownOption",
  "commander.unknownArgument",
  "commander.missingArgument",
  "commander.excessArguments",
  "commander.missingMandatoryOptionValue",
  "commander.optionMissingArgument",
  "commander.conflictingOption",
  "commander.invalidArgument",
]);

interface CommanderLikeError { code?: unknown; exitCode?: unknown }

function isCommanderError(error: unknown): error is CommanderLikeError {
  return typeof error === "object" && error !== null && typeof (error as { code?: unknown }).code === "string";
}

/**
 * Maps a Commander parse failure to a process exit code.
 *
 * Usage problems exit with the usage code so a caller can tell "invoked it
 * wrong" apart from "the audit found something" (audit findings) and from a
 * genuine runtime failure.
 */
export function exitCodeForCommanderError(error: unknown): ExitCode {
  if (!isCommanderError(error)) return EXIT_CODES.runtime;
  const code = error.code as string;
  if (HELP_CODES.has(code)) return EXIT_CODES.success;
  if (code === "commander.help") return error.exitCode === 0 ? EXIT_CODES.success : EXIT_CODES.usage;
  if (USAGE_CODES.has(code)) return EXIT_CODES.usage;
  return EXIT_CODES.runtime;
}
