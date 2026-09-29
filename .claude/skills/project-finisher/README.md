# project-finisher setup
From your repo root:
  mkdir -p .claude/skills .claude/agents
  cp -r project-finisher .claude/skills/
  cp project-finisher/assets/reviewer.md .claude/agents/
  cp project-finisher/assets/settings.json .claude/settings.json
  cp project-finisher/scripts/loop.sh ./agent-loop.sh
Then: claude  (first supervised run), later ./agent-loop.sh 40 (unattended).
