# Build context is the repo root (dockerContextDir in actor.json). Only the
# packages the audit needs are copied; the image's Playwright version matches
# packages/agent-runner (1.64.1).
FROM apify/actor-node-playwright-chrome:26-1.64.1

COPY --chown=myuser:myuser packages/shared packages/shared
COPY --chown=myuser:myuser packages/verifier packages/verifier
# agent-runner depends on agent-interface (the CLI-mode runner), which reads
# the storefront's catalog; npm install needs the package to resolve.
COPY --chown=myuser:myuser packages/agent-interface packages/agent-interface
COPY --chown=myuser:myuser apps/storefront/lib/catalog.ts apps/storefront/lib/catalog.ts
COPY --chown=myuser:myuser packages/agent-runner packages/agent-runner
COPY --chown=myuser:myuser packages/benchmark packages/benchmark
COPY --chown=myuser:myuser packages/apify packages/apify

RUN echo '{"name":"perry-actor","private":true,"type":"module","workspaces":["packages/*"]}' > package.json \
 && npm install --omit=dev --no-audit --no-fund \
 && npm ls playwright apify @anthropic-ai/sdk

CMD ["node", "packages/apify/main.ts"]
