#!/bin/bash

# Cleanup Replit dependencies and files

echo "Removing old Replit integration folders..."
rm -rf server/replit_integrations
rm -rf client/replit_integrations

echo "Removing Replit configuration files..."
rm -f .replit replit.md

echo "Cleaning up package-lock.json to remove @replit dependencies..."
rm -f package-lock.json

echo "Reinstalling dependencies without @replit packages..."
npm install

echo "✅ Cleanup complete! Replit dependencies have been removed."
echo "The new integrations are now located in: server/integrations/"
