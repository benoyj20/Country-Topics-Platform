.DEFAULT_GOAL := help

.PHONY: help bootstrap env infra-up infra-down infra-config dev dev-prototype migrate generate reset-2fa format lint typecheck test test-int build check

# Use the local .env when it exists; otherwise Compose falls back to the defaults in compose.yaml.
COMPOSE = docker compose $(if $(wildcard .env),--env-file .env) -f deploy/compose/compose.yaml
WEB = pnpm --filter @countrytopics/web

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Country Topics Platform commands:\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## Install JavaScript dependencies
	pnpm install

env: ## Create .env, or add variables it is missing from .env.example (never changes set values)
	@node deploy/scripts/sync-env.mjs .env.example .env

infra-up: ## Start PostgreSQL, Redis (Valkey), Mailpit, and S3 storage (SeaweedFS)
	$(COMPOSE) up -d --wait

infra-down: ## Stop local infrastructure, keeping its data volumes
	$(COMPOSE) down

infra-config: ## Validate the Compose configuration
	$(COMPOSE) config --quiet

dev: ## Run the site (http://localhost:3000) and the worker (run make migrate first)
	pnpm --parallel --filter @countrytopics/web --filter @countrytopics/worker dev

dev-prototype: ## Run the YouTube snippet prototype at http://localhost:4173
	pnpm --filter @countrytopics/youtube-snippet-prototype dev

migrate: ## Apply database migrations to DATABASE_URL
	$(WEB) migrate

generate: ## Regenerate Payload's TypeScript types and admin import map
	$(WEB) generate

reset-2fa: ## Remove someone's authenticator app so they can set up a new one: make reset-2fa EMAIL=...
	$(WEB) reset-two-factor "$(EMAIL)"

format: ## Format JavaScript and TypeScript packages
	pnpm -r exec prettier --write .

lint: ## Run linters
	pnpm lint

typecheck: ## Run static type checks
	pnpm typecheck

test: ## Run unit tests
	pnpm test

test-int: ## Run integration tests against TEST_DATABASE_URL (wipes that database)
	pnpm test:int

build: ## Build all packages
	pnpm build

check: lint typecheck test test-int build infra-config ## Run all repository checks (needs make infra-up)
