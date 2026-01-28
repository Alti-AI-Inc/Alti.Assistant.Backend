#!/bin/bash

# Tenant System Test Runner
# Automates Postman collection testing using Newman

set -e

echo "=========================================="
echo "  Tenant System Testing Suite"
echo "=========================================="
echo ""

# Check if Newman is installed
if ! command -v newman &> /dev/null; then
    echo "❌ Newman is not installed. Installing..."
    npm install -g newman newman-reporter-htmlextra
fi

# Configuration
COLLECTIONS_DIR="./postman_collections"
ENVIRONMENT="${COLLECTIONS_DIR}/Tenant_Testing.postman_environment.json"
REPORTS_DIR="./test-reports"
TIMESTAMP=$(date +"%Y%m%d_%H%M%S")

# Create reports directory
mkdir -p "$REPORTS_DIR"

echo "📁 Collections Directory: $COLLECTIONS_DIR"
echo "🌍 Environment: $ENVIRONMENT"
echo "📊 Reports Directory: $REPORTS_DIR"
echo ""

# Function to run a collection
run_collection() {
    local collection=$1
    local collection_name=$(basename "$collection" .postman_collection.json)
    
    echo ""
    echo "==================== Running: $collection_name ===================="
    echo ""
    
    newman run "$collection" \
        -e "$ENVIRONMENT" \
        --reporters cli,htmlextra,json \
        --reporter-htmlextra-export "$REPORTS_DIR/${collection_name}_${TIMESTAMP}.html" \
        --reporter-json-export "$REPORTS_DIR/${collection_name}_${TIMESTAMP}.json" \
        --timeout-request 30000 \
        --bail \
        || echo "⚠️  Some tests failed in $collection_name"
    
    echo ""
    echo "✅ Completed: $collection_name"
    echo ""
}

# Main test execution
echo "🚀 Starting test execution..."
echo ""

# Check if specific collection is specified
if [ $# -gt 0 ]; then
    # Run specific collection
    COLLECTION="${COLLECTIONS_DIR}/$1"
    if [ -f "$COLLECTION" ]; then
        run_collection "$COLLECTION"
    else
        echo "❌ Collection not found: $COLLECTION"
        exit 1
    fi
else
    # Run all collections
    echo "Running all test collections..."
    echo ""
    
    # Phase 1: Tenant Management
    if [ -f "${COLLECTIONS_DIR}/Tenant_Management_API.postman_collection.json" ]; then
        run_collection "${COLLECTIONS_DIR}/Tenant_Management_API.postman_collection.json"
    fi
    
    # Phase 2: Limits Enforcement
    if [ -f "${COLLECTIONS_DIR}/Limits_Enforcement_API.postman_collection.json" ]; then
        run_collection "${COLLECTIONS_DIR}/Limits_Enforcement_API.postman_collection.json"
    fi
    
    # Add more collections as they are created
fi

echo ""
echo "=========================================="
echo "  Test Execution Complete"
echo "=========================================="
echo ""
echo "📊 Reports generated in: $REPORTS_DIR"
echo "🌐 Open HTML reports to view detailed results"
echo ""

# Generate summary report
echo "Generating summary..."
node -e "
const fs = require('fs');
const reports = fs.readdirSync('$REPORTS_DIR')
    .filter(f => f.includes('$TIMESTAMP') && f.endsWith('.json'));

let totalTests = 0;
let totalPassed = 0;
let totalFailed = 0;

reports.forEach(report => {
    const data = JSON.parse(fs.readFileSync('$REPORTS_DIR/' + report, 'utf8'));
    const stats = data.run.stats;
    totalTests += stats.tests.total;
    totalPassed += stats.tests.total - stats.tests.failed;
    totalFailed += stats.tests.failed;
});

console.log('');
console.log('═══════════════════════════════════════');
console.log('  SUMMARY REPORT');
console.log('═══════════════════════════════════════');
console.log('  Total Tests:    ' + totalTests);
console.log('  ✅ Passed:      ' + totalPassed + ' (' + Math.round((totalPassed/totalTests)*100) + '%)');
console.log('  ❌ Failed:      ' + totalFailed);
console.log('  Pass Rate:     ' + Math.round((totalPassed/totalTests)*100) + '%');
console.log('═══════════════════════════════════════');
console.log('');

if (totalFailed === 0) {
    console.log('🎉 All tests passed!');
} else {
    console.log('⚠️  Some tests failed. Check reports for details.');
    process.exit(1);
}
" || echo "Summary generation skipped (Node.js required)"

echo ""
echo "✨ Done!"
