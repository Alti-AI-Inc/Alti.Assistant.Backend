#!/bin/bash

# Script to add secrets to GitHub repository using GitHub CLI
# Prerequisites: 
# 1. Install GitHub CLI: brew install gh
# 2. Authenticate: gh auth login

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
NC='\033[0m' # No Color

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  GitHub Secrets Setup Script${NC}"
echo -e "${GREEN}========================================${NC}\n"

# Check if gh CLI is installed
if ! command -v gh &> /dev/null; then
    echo -e "${RED}ERROR: GitHub CLI (gh) is not installed.${NC}"
    echo -e "${YELLOW}Install it with: brew install gh${NC}"
    exit 1
fi

# Check if authenticated
if ! gh auth status &> /dev/null; then
    echo -e "${RED}ERROR: Not authenticated with GitHub CLI.${NC}"
    echo -e "${YELLOW}Run: gh auth login${NC}"
    exit 1
fi

# Get repository (auto-detect from current directory)
REPO=$(gh repo view --json nameWithOwner -q .nameWithOwner 2>/dev/null)
if [ -z "$REPO" ]; then
    echo -e "${RED}ERROR: Not in a GitHub repository directory.${NC}"
    exit 1
fi

echo -e "${GREEN}Repository: ${REPO}${NC}\n"

# Default values from deploy-vm.ps1
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
echo $SCRIPT_DIR
GCP_SA_FILE="${SCRIPT_DIR}/alti_gcp.json"
echo $GCP_SA_FILE
GCP_PROJECT_ID="alti-assistant-prod"
VM_HOST="104.197.53.196"
VM_USER="emondarock"
VM_SSH_KEY_PATH="/Users/emonreja/.ssh/alti-vm-key"
VM_SSH_PORT="22"
VM_COMPOSE_DIR="~"
VM_COMPOSE_FILE="docker-compose.yml"

# Function to add secret with default value
add_secret_with_default() {
    local secret_name=$1
    local default_value=$2
    local is_file=$3
    local secret_value=""
    
    echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${YELLOW}Secret: ${secret_name}${NC}"
    
    if [ "$is_file" = "true" ]; then
        echo -e "${YELLOW}Default file: ${default_value}${NC}"
        if [ -f "$default_value" ]; then
            echo -e "${GREEN}✓ File exists${NC}"
            echo -e "${YELLOW}Press Enter to use default, or type new path:${NC}"
            read -r user_input
            
            if [ -z "$user_input" ]; then
                secret_value=$(cat "$default_value")
            else
                if [ -f "$user_input" ]; then
                    secret_value=$(cat "$user_input")
                else
                    echo -e "${RED}File not found: $user_input${NC}"
                    return 1
                fi
            fi
        else
            echo -e "${RED}✗ Default file not found${NC}"
            echo -e "${YELLOW}Enter path to file:${NC}"
            read -r user_input
            if [ -f "$user_input" ]; then
                secret_value=$(cat "$user_input")
            else
                echo -e "${RED}File not found: $user_input${NC}"
                return 1
            fi
        fi
    else
        echo -e "${YELLOW}Default: ${default_value}${NC}"
        echo -e "${YELLOW}Press Enter to use default, or type new value:${NC}"
        read -r user_input
        
        if [ -z "$user_input" ]; then
            secret_value="$default_value"
        else
            secret_value="$user_input"
        fi
    fi
    
    if [ -z "$secret_value" ]; then
        echo -e "${RED}ERROR: Empty value for ${secret_name}${NC}\n"
        return 1
    fi
    
    # Add secret to GitHub
    echo "$secret_value" | gh secret set "$secret_name" --repo="$REPO"
    
    if [ $? -eq 0 ]; then
        echo -e "${GREEN}✓ ${secret_name} added successfully${NC}\n"
    else
        echo -e "${RED}✗ Failed to add ${secret_name}${NC}\n"
        return 1
    fi
}

# Add all required secrets
echo -e "${GREEN}Adding secrets for deploy-vm-dev.yml workflow...${NC}\n"
echo -e "${YELLOW}Press Enter to accept defaults or type new values${NC}\n"

add_secret_with_default "GCP_SA_KEY" "$GCP_SA_FILE" "true"
add_secret_with_default "GCP_PROJECT_ID" "$GCP_PROJECT_ID" "false"
add_secret_with_default "VM_HOST" "$VM_HOST" "false"
add_secret_with_default "VM_USER" "$VM_USER" "false"
add_secret_with_default "VM_SSH_KEY" "$VM_SSH_KEY_PATH" "true"
add_secret_with_default "VM_SSH_PORT" "$VM_SSH_PORT" "false"
add_secret_with_default "VM_COMPOSE_DIR" "$VM_COMPOSE_DIR" "false"
add_secret_with_default "VM_COMPOSE_FILE" "$VM_COMPOSE_FILE" "false"

echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  Secrets Setup Complete!${NC}"
echo -e "${GREEN}========================================${NC}\n"

echo -e "${YELLOW}Verify secrets with:${NC}"
echo -e "  gh secret list --repo=$REPO\n"
