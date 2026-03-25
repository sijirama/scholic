# Scholic Annotation Platform - Makefile

# Build the application
all: infra-up watch

build:
	@echo "Building..."
	@CGO_ENABLED=1 go build -o scholic_api cmd/api/main.go	

start:	
	@./scholic_api 

# Run the application
run:
	@CGO_ENABLED=1 go run cmd/api/main.go 

# Run API only
run-api:
	@CGO_ENABLED=1 go run cmd/api/main.go

# Create full setup (including app in docker if Dockerfile exists, otherwise just infra)
docker-run:
	if docker compose up --build 2>/dev/null; then \
		: ; \
	else \
		echo "Falling back to Docker Compose V1"; \
		docker-compose up --build; \
	fi

# Shutdown full setup
docker-down:
	if docker compose down 2>/dev/null; then \
		: ; \
	else \
		echo "Falling back to Docker Compose V1"; \
		docker-compose down; \
	fi

# Run only infrastructure containers (Postgres + Redis)
infra-up:
	if docker compose -f dev-compose.yml up -d 2>/dev/null; then \
		: ; \
	else \
		echo "Falling back to Docker Compose V1"; \
		docker-compose -f dev-compose.yml up -d; \
	fi

# Shutdown infrastructure containers
infra-down:
	if docker compose -f dev-compose.yml down 2>/dev/null; then \
		: ; \
	else \
		echo "Falling back to Docker Compose V1"; \
		docker-compose -f dev-compose.yml down; \
	fi

# Test the application
test:
	@echo "Testing..."
	@CGO_ENABLED=1 go test ./... 

# Clean the binary and containers
clean:
	@echo "Cleaning..."
	@rm -f scholic_api
	docker stop scholic-postgres 2>/dev/null || true
	docker rm scholic-postgres 2>/dev/null || true
	docker stop scholic-redis 2>/dev/null || true
	docker rm scholic-redis 2>/dev/null || true

# Live Reload using 'air'
watch:
	@if command -v air > /dev/null; then \
	    CGO_ENABLED=1 air; \
            echo "Watching...";\
        else \
            read -p "Go's 'air' is not installed on your machine. Do you want to install it? [Y/n] " choice; \
            if [ "$$choice" != "n" ] && [ "$$choice" != "N" ]; then \
                go install github.com/air-verse/air@latest; \
		CGO_ENABLED=1 air; \
                echo "Watching...";\
            else \
                echo "You chose not to install air. Exiting..."; \
                exit 1; \
            fi; \
        fi

# Development helpers
dev: infra-up ## Start infrastructure and run application in development mode
	@sleep 3
	@make run

dev-stop: infra-down ## Stop development environment
	@echo "Development environment stopped"

logs: ## Show Docker container logs
	@docker compose logs -f 2>/dev/null || docker-compose logs -f

db-reset: ## Reset database (drop and recreate)
	@echo "Resetting database..."
	@docker compose exec postgres psql -U scholic_user -d postgres -c "DROP DATABASE IF EXISTS scholic_db;"
	@docker compose exec postgres psql -U scholic_user -d postgres -c "CREATE DATABASE scholic_db;"
	@echo "Database reset complete. GORM will auto-migrate on next start."

help: ## Show this help message
	@echo "Scholic Annotation Platform - Available Commands:"
	@echo ""
	@awk 'BEGIN {FS = ":.*##"; printf "\033[36m\033[0m\n"} /^[a-zA-Z_-]+:.*?##/ { printf "  \033[36m%-15s\033[0m %s\n", $$1, $$2 } /^##@/ { printf "\n\033[1m%s\033[0m\n", substr($$0, 5) } ' $(MAKEFILE_LIST)
	@echo ""
	@echo "Common workflows:"
	@echo "  make dev        # Start infrastructure and run app"
	@echo "  make watch      # Run with live reload (requires air)"
	@echo "  make infra-up   # Start Postgres and Redis"
	@echo "  make db-reset   # Wipe and recreate the database"

.PHONY: all build run test clean watch docker-run docker-down infra-up infra-down run-api dev dev-stop logs db-reset help
