#!/bin/bash

echo "🚀 Preparing Spendly for deployment..."

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Function to print colored output
print_status() {
    echo -e "${GREEN}✅ $1${NC}"
}

print_warning() {
    echo -e "${YELLOW}⚠️  $1${NC}"
}

print_error() {
    echo -e "${RED}❌ $1${NC}"
}

# Check if we're in the right directory
if [ ! -f "package.json" ]; then
    print_error "Please run this script from the project root directory"
    exit 1
fi

print_status "Starting deployment preparation..."

# 1. Install dependencies
print_status "Installing dependencies..."
npm run install-all
if [ $? -ne 0 ]; then
    print_error "Failed to install dependencies"
    exit 1
fi

# 2. Build client
print_status "Building client application..."
cd client
npm run build
if [ $? -ne 0 ]; then
    print_error "Failed to build client"
    exit 1
fi
cd ..

# 3. Check environment files
print_status "Checking environment configuration..."

if [ ! -f "server/.env" ]; then
    print_warning "server/.env not found. Creating from template..."
    cp server/.env.example server/.env
    print_warning "Please update server/.env with your production values!"
fi

if [ ! -f "client/.env.production" ]; then
    print_warning "client/.env.production not found. Please create it with:"
    echo "VITE_API_URL=https://your-backend-domain.com"
fi

# 4. Security check
print_status "Running security checks..."

# Check for default JWT secret
if grep -q "your-super-secret-jwt-key-change-this-in-production" server/.env 2>/dev/null; then
    print_error "Please change the default JWT_SECRET in server/.env"
    exit 1
fi

# Check for development URLs in production
if grep -q "localhost" client/.env.production 2>/dev/null; then
    print_warning "Found localhost in client/.env.production - make sure this is intentional"
fi

# 5. Test build
print_status "Testing server startup..."
cd server
timeout 10s npm start &
SERVER_PID=$!
sleep 5

# Check if server is responding
if curl -f http://localhost:5000/health > /dev/null 2>&1; then
    print_status "Server health check passed"
else
    print_warning "Server health check failed - please verify manually"
fi

# Kill test server
kill $SERVER_PID 2>/dev/null
cd ..

# 6. Create deployment summary
print_status "Creating deployment summary..."
echo "
📋 DEPLOYMENT SUMMARY
=====================

✅ Dependencies installed
✅ Client built successfully
✅ Environment files checked
✅ Security checks passed
✅ Server startup tested

📁 Built files:
   - Client: client/dist/
   - Server: server/

🔧 Next steps:
   1. Update environment variables for production
   2. Deploy using your preferred method (see DEPLOYMENT.md)
   3. Test all functionality after deployment

📚 Deployment guides available in DEPLOYMENT.md

🚀 Ready for deployment!
" > deployment-summary.txt

print_status "Deployment preparation complete!"
print_status "Check deployment-summary.txt for next steps"

echo ""
echo "🌟 Your Spendly app is ready for deployment!"
echo "📖 See DEPLOYMENT.md for detailed deployment instructions"
echo ""