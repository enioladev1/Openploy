// Only a leading \b, not a trailing one - real log lines are full of
// inflections ("errors", "warnings", "failed", "completed") that a trailing
// boundary would silently miss. Ordered by specificity: a line mentioning
// both "warning" and "error" (e.g. "treating warnings as errors") should
// read as an error, so error patterns are checked first.
const ERROR_PATTERN = /\b(error|fatal|fail|exception|panic|traceback)/i;
const WARNING_PATTERN = /\b(warn|deprecat|retrying)/i;
const SUCCESS_PATTERN = /\b(success|complete|done|healthy|ready)/i;

export function logLineColorClass(content: string): string {
  if (ERROR_PATTERN.test(content)) return "text-red-400";
  if (WARNING_PATTERN.test(content)) return "text-amber-400";
  if (SUCCESS_PATTERN.test(content)) return "text-emerald-400";
  return "text-zinc-100";
}
