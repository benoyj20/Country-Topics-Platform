.DEFAULT_GOAL := help

.PHONY: help bootstrap env infra-up infra-down infra-config dev-prototype format lint typecheck test build check

# Use the local .env when it exists; otherwise Compose falls back to the defaults in compose.yaml.
COMPOSE = docker compose $(if $(wildcard .env),--env-file .env) -f deploy/compose/compose.yaml

help: ## Show available commands
	@awk 'BEGIN {FS = ":.*## "; printf "Country Topics Platform commands:\n"} /^[a-zA-Z_-]+:.*## / {printf "  %-14s %s\n", $$1, $$2}' $(MAKEFILE_LIST)

bootstrap: ## Install JavaScript dependencies
	pnpm install

env: ## Create .env from .env.example if it does not exist (never overwrites)
	@if [ -f .env ]; then echo ".env already exists; left unchanged"; else cp .env.example .env && echo "Created .env"; fi

infra-up: ## Start PostgreSQL, Redis (Valkey), and Mailpit
	$(COMPOSE) up -d --wait

infra-down: ## Stop local infrastructure, keeping its data volumes
	$(COMPOSE) down

infra-config: ## Validate the Compose configuration
	$(COMPOSE) config --quiet

dev-prototype: ## Run the YouTube snippet prototype at http://localhost:4173
	pnpm --filter @countrytopics/youtube-snippet-prototype dev

format: ## Format JavaScript and TypeScript packages
	pnpm -r exec prettier --write .

lint: ## Run linters
	pnpm lint

typecheck: ## Run static type checks
	pnpm typecheck

test: ## Run unit tests
	pnpm test

build: ## Build all packages
	pnpm build

check: lint typecheck test build infra-config ## Run all repository checks
