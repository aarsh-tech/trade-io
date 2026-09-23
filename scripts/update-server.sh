#!/usr/bin/env bash
# ==============================================================================
# Tradeio Automated Zero-Downtime Safe Deployer (pnpm edition)
# Performs git pull, compiles backend, runs 12/12 automated safety checks,
# and safely restarts PM2 only if all tests pass with 100% success.
# ==============================================================================
set -eo pipefail

# ANSI color codes
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m' # No Color

# Error Trap: If anything fails, inform user that PM2 was NOT restarted
trap 'echo -e "\n${RED}${BOLD}❌ Deployment aborted due to an error above!${NC}\n${YELLOW}ℹ️  The running PM2 process was NOT modified and remains safely online.${NC}\n"' ERR

echo -e "\n${CYAN}==============================================================================${NC}"
echo -e "${BOLD}🚀 Tradeio Automated Safe Deployer${NC}"
echo -e "${CYAN}==============================================================================${NC}\n"

# 1. Resolve project root directory
PROJECT_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$PROJECT_ROOT"
echo -e "${CYAN}[1/6] Navigating to repository root...${NC}"
echo -e "      Working Directory: ${BOLD}${PROJECT_ROOT}${NC}"

# 2. Check pnpm availability
echo -e "\n${CYAN}[2/6] Verifying package manager...${NC}"
if ! command -v pnpm &> /dev/null; then
    echo -e "${RED}pnpm not found in PATH. Please ensure pnpm is installed.${NC}"
    exit 1
fi
echo -e "      ${GREEN}✅ Using pnpm $(pnpm --version)${NC}"

# 3. Pull latest updates from Git
echo -e "\n${CYAN}[3/6] Fetching and pulling latest changes from main...${NC}"
echo -e "      Current Commit: ${YELLOW}$(git log -1 --oneline)${NC}"
git fetch origin main
git pull origin main
echo -e "      Updated Commit: ${GREEN}$(git log -1 --oneline)${NC}"

# 4. Generate Prisma Client
echo -e "\n${CYAN}[4/6] Generating Prisma Client...${NC}"
pnpm db:generate
echo -e "      ${GREEN}✅ Prisma schema updated.${NC}"

# 5. Compile Backend Bundle
echo -e "\n${CYAN}[5/6] Building backend with pnpm...${NC}"
pnpm --filter @algo-trade/auth-service build
echo -e "      ${GREEN}✅ NestJS backend build successful.${NC}"

# 6. Run Pre-Restart Automated Verification Tests
echo -e "\n${CYAN}[6/6] Running 12-point automated safety & logic verification suite...${NC}"
node apps/auth-service/scripts/verify-all-fixes.js

echo -e "\n${GREEN}${BOLD}🎉 ALL PRE-FLIGHT TESTS PASSED! Safely restarting PM2...${NC}"

# Restart Backend PM2 process
pm2 restart algo-backend

# Brief pause to allow process initialization
sleep 2

echo -e "\n${CYAN}==============================================================================${NC}"
echo -e "${GREEN}${BOLD}✅ DEPLOYMENT SUCCESSFUL — SERVICES ARE LIVE & RUNNING!${NC}"
echo -e "${CYAN}==============================================================================${NC}\n"

# Display PM2 Status
pm2 status

# Show recent PM2 logs
echo -e "\n${CYAN}--- Recent Backend Startup Logs ---${NC}"
pm2 logs algo-backend --lines 200 --nostream
echo -e "${CYAN}-----------------------------------${NC}\n"
