#!/usr/bin/env node
import { spawnSync } from 'child_process';

const args = process.argv.slice(2);

// build/submit はガード
if ((args[0] === 'build' || args[0] === 'submit') && process.env.ALLOW_EAS_BUILD !== '1') {
  console.error('❌ EAS build/submit はガードされています。');
  console.error('本当に実行する場合は以下を実行してください：');
  console.error('');
  console.error('  export ALLOW_EAS_BUILD=1');
  console.error('  npx eas-cli ' + args.join(' '));
  console.error('');
  process.exit(1);
}

// それ以外のコマンドは通す
const result = spawnSync('npx', ['eas-cli', ...args], { stdio: 'inherit' });
process.exit(result.status ?? 1);
