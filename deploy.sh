#!/bin/bash

# Skrypt do wdrażania aplikacji na Vercel

set -e

echo "🚀 Rozpoczynanie wdrażania..."

# 1. Buildowanie projektu
echo "📦 Budowanie aplikacji..."
npm run build

# 2. Sprawdzenie czy są zmiany
echo "📝 Sprawdzenie zmian..."
if [ -n "$(git status --porcelain)" ]; then
  # 3. Dodanie zmian
  echo "➕ Dodawanie zmian..."
  git add -A

  # 4. Commitowanie zmian
  COMMIT_MESSAGE="${1:-Update: deployment from development}"
  echo "💾 Commitowanie: $COMMIT_MESSAGE"
  git commit -m "$COMMIT_MESSAGE"
else
  echo "✅ Brak nowych zmian do commitowania"
fi

# 5. Pushowanie na GitHub
echo "🔄 Pushing do GitHub..."
git push origin main

echo "✅ Wdrożenie zakończone!"
echo "📍 Vercel automatycznie wdroży zmiany..."
echo ""
echo "Aby sprawdzić status wdrożenia:"
echo "  - Przejdź do https://vercel.com/dashboard"
echo "  - Lub użyj: vercel logs"
