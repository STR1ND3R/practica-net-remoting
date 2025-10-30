FROM node:18-alpine

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install --production

# Copy source code
COPY . .

# Create data and logs directories
RUN mkdir -p data logs

# Expose ports (all services)
EXPOSE 50051 50052 50053 50054 8080

# Default command (can be overridden in docker-compose)
CMD ["node", "market-service/server.js"]

