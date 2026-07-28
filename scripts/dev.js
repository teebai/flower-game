/**
 * dev.js — Vite dev-server launcher.
 *
 * Why this exists: preview tooling appends `--host localhost --port <n>
 * --strictPort` to `npm run dev`. On Windows with Node 18+, the hostname
 * "localhost" resolves to IPv6 ::1 first, so Vite binds [::1] only — and
 * anything connecting via IPv4 127.0.0.1 gets connection refused (blank
 * preview). Binding only 0.0.0.0 has the mirror-image problem for clients
 * that prefer ::1. This wrapper parses the forwarded CLI args but always
 * binds the dual-stack wildcard '::', which accepts BOTH IPv4 (127.0.0.1)
 * and IPv6 (::1) loopback connections, so any preview client can connect.
 */

async function main() {
  const args = process.argv.slice(2);

  let port = 3000;
  let strictPort = false;
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--port' && args[i + 1]) {
      port = Number(args[i + 1]);
      i++;
    } else if (args[i] === '--strictPort') {
      strictPort = true;
    }
    // --host is intentionally ignored; see header comment.
  }

  const { createServer } = await import('vite');
  const server = await createServer({
    server: {
      host: '::',
      port,
      strictPort,
    },
  });
  await server.listen();
  server.printUrls();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
