#!/usr/bin/env bash
# Committer og pusher endringer i data/ fra en GitHub-jobb, og tåler at nettsiden
# har lagret noe i mellomtiden.
#
# Bruk: bash tools/publiser.sh "Commit-melding" <kommando som lager endringene> [argumenter …]
#
# Først prøves en vanlig «git pull --rebase». Gir det konflikt (for eksempel fordi
# noen endret det samme ønsket på nettsiden mens jobben gikk), kastes jobbens
# endringer, siste versjon hentes, og kommandoen kjøres på nytt på den. Slik blir
# det aldri overskrevet noe andre har lagret.
set -uo pipefail

msg="$1"
shift

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"

for attempt in 1 2 3 4 5; do
  if [ -z "$(git status --porcelain -- data)" ]; then
    echo "Ingen endringer å publisere"
    exit 0
  fi
  git add data
  git commit -q -m "$msg"
  if git pull -q --rebase origin main && git push -q origin HEAD:main; then
    echo "Publisert (forsøk $attempt)"
    # Push med GITHUB_TOKEN starter ikke alltid Pages-bygget av seg selv
    if [ -n "${GITHUB_REPOSITORY:-}" ]; then
      gh api -X POST "repos/$GITHUB_REPOSITORY/pages/builds" --silent || echo "Kunne ikke be om nytt Pages-bygg"
    fi
    exit 0
  fi
  echo "Kunne ikke publisere (forsøk $attempt): henter siste versjon og kjører på nytt"
  git rebase --abort 2>/dev/null || true
  git fetch -q origin main
  git reset -q --hard origin/main
  "$@" || exit 1
  sleep $((attempt * 3))
done

echo "Ga opp etter 5 forsøk"
exit 1
