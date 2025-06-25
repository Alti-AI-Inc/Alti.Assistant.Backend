
# Use the official Node.js image as a base
# FROM node:18-alpine

# Use the official Ubuntu base image
FROM ubuntu:latest

# Update package lists and install Node.js, npm, and nodemon
RUN apt-get update && apt-get install -y \
    curl \
    && curl -fsSL https://deb.nodesource.com/setup_18.x | bash - \
    && apt-get install -y nodejs \
    && npm install -g nodemon \
    && apt-get clean

# Set the working directory inside the container
WORKDIR /app/ason-core-service

# Copy package.json and package-lock.json files
COPY package*.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy the rest of the application code to the working directory
COPY . .

# Optionally copy the .env file (not recommended to keep in the image)
COPY .env .env

# Expose the port that the app runs on
EXPOSE 5100

# Command to run your app
CMD ["nodemon", "index.js"]
