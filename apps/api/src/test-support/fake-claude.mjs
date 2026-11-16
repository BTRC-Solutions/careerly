// A fake `claude` command for the tests (ADR-24). Usage: node fake-claude.mjs <scenario.json> <args…>
// The scenario file says how to answer; every `-p` call is appended to `<scenario>.calls.jsonl`.
import fs from 'node:fs';

const [scenarioFile, ...args] = process.argv.slice(2);
const scenario = JSON.parse(fs.readFileSync(scenarioFile, 'utf8'));

if (args[0] === '--version') {
  process.stdout.write('9.9.9 (Claude Code)\n');
  process.exit(0);
}
if (args[0] === 'auth' && args[1] === 'status') {
  process.stdout.write(
    JSON.stringify({
      loggedIn: scenario.loggedIn,
      authMethod: scenario.loggedIn ? 'claude.ai' : 'none',
    }),
  );
  process.exit(0);
}

const stdin = fs.readFileSync(0, 'utf8');
fs.appendFileSync(
  `${scenarioFile}.calls.jsonl`,
  `${JSON.stringify({
    args,
    stdin,
    cwd: process.cwd(),
    files: fs.readdirSync(process.cwd()),
    anthropicEnv: Object.keys(process.env).filter((name) => /^(ANTHROPIC_|CAREERLY_)/.test(name)),
  })}\n`,
);

if (scenario.error) {
  process.stdout.write(
    JSON.stringify({
      type: 'result',
      subtype: 'error_during_execution',
      is_error: true,
      result: scenario.error,
    }),
  );
  process.exit(1);
}
process.stdout.write(
  JSON.stringify({
    type: 'result',
    subtype: 'success',
    is_error: false,
    result: JSON.stringify(scenario.answer),
    structured_output: scenario.answer,
    usage: { input_tokens: 50, cache_read_input_tokens: 10, output_tokens: 20 },
  }),
);
