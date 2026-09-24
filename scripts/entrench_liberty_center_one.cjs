const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

console.log('🚀 Initiating Liberty Center One Entrenchment Protocol...');

const modulesDir = path.join(__dirname, '../src/app/modules');
const dockerComposePath = path.join(__dirname, '../docker-compose.liberty.yml');
const dockerfilePath = path.join(__dirname, '../Dockerfile.liberty-engine');

const dockerfileContent = `
# ==========================================
# LIBERTY CENTER ONE - SOVEREIGN ENGINE
# ==========================================
FROM node:20-alpine
WORKDIR /opt/aphura/engine
COPY package*.json ./
RUN npm ci --only=production
COPY . .
ENV NODE_ENV=production
ENV INFRASTRUCTURE_PROVIDER="Liberty Center One"
CMD ["node", "src/server.js"]
`;
fs.writeFileSync(dockerfilePath, dockerfileContent.trim());
console.log('✅ Created Dockerfile.liberty-engine');

let servicesYAML = `
# ==========================================
# LIBERTY CENTER ONE - SOVEREIGN BACKEND
# 100% Entrenched, Dockerized, and Isolated
# ==========================================
version: '3.8'

networks:
  liberty-mesh:
    driver: bridge
    internal: true # Secure sovereign mesh

services:
  aphura-moe-router:
    build: 
      context: .
      dockerfile: Dockerfile.liberty-engine
    networks:
      - liberty-mesh
    ports:
      - "5000:5000"
    environment:
      - ENGINE_ROLE=ROUTER
`;

function getFiles(dir, files = []) {
  if (!fs.existsSync(dir)) return files;
  const fileList = fs.readdirSync(dir);
  for (const file of fileList) {
    const name = `${dir}/${file}`;
    if (fs.statSync(name).isDirectory()) {
      getFiles(name, files);
    } else if (name.endsWith('.service.js') && !name.includes('agent.service.js')) {
      files.push(name);
    }
  }
  return files;
}

const serviceFiles = getFiles(modulesDir);
console.log(`Found ${serviceFiles.length} isolated engines to entrench...`);

serviceFiles.forEach((file, index) => {
  const baseName = path.basename(file, '.service.js');
  const serviceName = `engine-${baseName.replace(/[^a-zA-Z0-9]/g, '-')}`;
  
  servicesYAML += `
  ${serviceName}:
    build:
      context: .
      dockerfile: Dockerfile.liberty-engine
    networks:
      - liberty-mesh
    environment:
      - ENGINE_ROLE=${baseName.toUpperCase()}
      - ISOLATION_LEVEL=MAX
      - COMPUTE_NODE="Liberty Center One - Alpha"
    restart: always
`;
});

fs.writeFileSync(dockerComposePath, servicesYAML.trim());
console.log(`✅ Generated massive docker-compose.liberty.yml with ${serviceFiles.length + 1} isolated containers.`);

try {
  execSync('git add docker-compose.liberty.yml Dockerfile.liberty-engine');
  execSync('git commit -m "feat: entrench all open-source engines as 100% isolated, dockerized microservices running on a sovereign Liberty Center One mesh network"');
  execSync('git push');
  console.log('✅ Infrastructure entrenchment committed and pushed to repository.');
} catch (e) {
  console.error('Git push failed:', e.message);
}

console.log('🎉 Liberty Center One Sovereign Backend Entrenchment Complete.');
