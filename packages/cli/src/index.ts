#!/usr/bin/env bun
/** `suli` — Superlibrary from a terminal. A client: it adds no authority and renders the server's refusals. */
import { baseUrl, clearCredentials, saveDevice, tokenSource } from './credential.ts';
import { deviceLogin, discoverPlane } from './plane-login.ts';
import { findCommands, renderCommandHelp, renderUsage } from './commands.ts';
import { flag, positionals } from './args.ts';
import { getItem, revoke, upload } from './artifacts.ts';

const VERSION = '0.0.1';

function fail(message: string): never {
  process.stderr.write(`suli: ${message}\n`);
  process.exit(1);
}

async function main(argv: string[]): Promise<void> {
  const [cmd, ...rest] = argv;
  const pos = positionals(rest);
  const json = rest.includes("--json");
  if (rest.includes("--help") && cmd) {
    const found = findCommands([cmd]);
    if (found.length === 0) fail(`unknown command: ${cmd}. Run suli help.`);
    process.stdout.write(found.map(renderCommandHelp).join('\n\n') + '\n');
    return;
  }
  switch (cmd) {
    case undefined:
    case "-h":
    case "--help":
      process.stdout.write(renderUsage() + '\n');
      return;

    case "help": {
      const found = pos.length ? findCommands(pos) : [];
      if (pos.length && found.length === 0) fail(`unknown command: ${pos.join(' ')}`);
      process.stdout.write((pos.length ? found.map(renderCommandHelp).join('\n\n') : renderUsage()) + '\n');
      return;
    }

    case "version":
      process.stdout.write(`suli ${VERSION} ${process.platform}/${process.arch}\n`);
      return;

    case "login": {
      // A network error, a timeout or a reply that is not JSON reaches the catch below as itself;
      // only the server's own answer that it has no plane is "names no sign-in service".
      const target = await discoverPlane(baseUrl());
      if (!target) fail(`${baseUrl()} names no sign-in service.`);
      const credential = await deviceLogin(target, { print: (l) => process.stdout.write(l + '\n'), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) });
      saveDevice({ credential, plane: target.plane, audience: target.audience });
      process.stdout.write('Signed in.\n');
      return;
    }

    case "logout":
      clearCredentials();
      process.stdout.write('Signed out.\n');
      return;

    case "whoami": {
      const token = await tokenSource().token();
      if (!token) fail('not signed in. Run suli login.');
      const res = await fetch(`${baseUrl()}/api/v1/me`, { headers: { Authorization: `Bearer ${token}` }, redirect: 'error' });
      if (!res.ok) fail(`the server refused (${res.status}): ${await res.text()}`);
      const me = (await res.json()) as { principalId: string; org: string; role: string };
      process.stdout.write(json ? JSON.stringify(me) + '\n' : `${me.principalId} in ${me.org} (${me.role})\n`);
      return;
    }

    case "upload":
      return upload(pos[0], { title: flag(rest, "--title"), item: flag(rest, "--item"), board: flag(rest, "--board"), entry: flag(rest, "--entry"), expires: flag(rest, "--expires"), override: flag(rest, "--override"), json });

    case "get":
      return getItem(pos[0], { embed: rest.includes("--embed"), version: flag(rest, "--version"), json });

    case "revoke":
      return revoke(pos[0], { version: flag(rest, "--version"), reason: flag(rest, "--reason"), json });

    default:
      fail(`unknown command: ${cmd}. Run suli help.`);
  }
}

await main(process.argv.slice(2)).catch((e: unknown) => fail(e instanceof Error ? e.message : String(e)));
